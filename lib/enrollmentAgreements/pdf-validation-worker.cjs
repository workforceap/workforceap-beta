// Isolated structural validation only. pdf-lib parses objects; it does not run
// document JavaScript, external URLs, forms, signatures, or embedded actions.
const { parentPort, workerData } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const { inflateSync } = require('node:zlib');
const { PDFDocument, ParseSpeeds, PDFDict, PDFArray, PDFName, PDFRef, PDFStream, PDFRawStream, PDFString, PDFHexString } = require('pdf-lib');

// SHA-256 of the supplied template: dee5087ba4503c3d38dfb10c8e149a630f5c8b72e3c9d8a045a306737afff3a5.
// Hashes cover exact decoded JavaScript BYTES, never evaluated source. A hash
// alone is insufficient: the original field/event or named-document context
// must also match, so the Finalize button cannot be relocated to OpenAction.
const SCRIPT_HASHES = {
  courseCopy: '05cbcbf67a5bb235a5a7077f0c56a193b11c5031de875b7e16b834d08421b8de',
  course: '4a6550a28d3e65a6efe607b101ae64073fef2aeb01383401ecf8c648e61d05e1',
  phoneFormat: '26ca52a12d0deacb91bc3d056d6b7529f9ee3a6e79f6db4e6d2f3761190826e5',
  phoneValidate: 'd7b406969ce7d77e9bfb731db97c083484f08af94a37dd19c2940c10914a7181',
  email: 'ab4ff482f391a1892694c9e04fb1dc6e5125781403566c66a97e2f0427ee4ddd',
  dateFormat: '784a25b22666e513abfdab953867c924a5dbd5deb7a5c47a63d57a1e82afd709',
  enrollmentDate: '396216e5fa4c47ab630512c150935b4a66c50b6c67e5c123795bf68cc535ba0d',
  endDate: '4f886f2ba673cfff94d1d6001fc50f2dd66dd8d734f40cec7aed59df97560a9e',
  participantSignature: '42fa12dffdd1bb85e5ef6ffb8059320087e4bc83240859ab96b88287c8d898df',
  officialSignature: '02d3bd16982bab76d98c7fe371fa2054a6468b36aef54b28af3c7dda6295314f',
  participantStyle: 'af4ce3788d661cf9e96e45ac47657c6218340294e890e1767fb49bcc09037fef',
  officialStyle: '131abc9845298d7a0c932325f042251daf9715abbd74b1c81cc32ef9ed5debf2',
  finalize: '50ea815866900aa836eb3a47b2a27ed7e31e1414afb03da55b5fb938293845d4',
  calculate: 'd71b330b3609e80958d52e225d1148046e4fb9145bf80f4d5f263d566cf41211',
};
const FIELD_SCRIPTS = {
  'Course_Name.AA.V': SCRIPT_HASHES.course,
  'Course_Name_Page_2.AA.C': SCRIPT_HASHES.courseCopy,
  'Course_Name_Page_3.AA.C': SCRIPT_HASHES.courseCopy,
  'Course_Name_Page_4.AA.C': SCRIPT_HASHES.courseCopy,
  'Home_Phone.AA.F': SCRIPT_HASHES.phoneFormat,
  'Home_Phone.AA.V': SCRIPT_HASHES.phoneValidate,
  'Cell_Phone.AA.F': SCRIPT_HASHES.phoneFormat,
  'Cell_Phone.AA.V': SCRIPT_HASHES.phoneValidate,
  'Counselor_Phone.AA.F': SCRIPT_HASHES.phoneFormat,
  'Counselor_Phone.AA.V': SCRIPT_HASHES.phoneValidate,
  'Participant_Email.AA.V': SCRIPT_HASHES.email,
  'Counselor_Email.AA.V': SCRIPT_HASHES.email,
  'Enrollment_Date.AA.F': SCRIPT_HASHES.dateFormat,
  'Enrollment_Date.AA.V': SCRIPT_HASHES.enrollmentDate,
  'End_Date.AA.F': SCRIPT_HASHES.dateFormat,
  'End_Date.AA.C': SCRIPT_HASHES.endDate,
  'Participant_Signature.AA.V': SCRIPT_HASHES.participantSignature,
  'Official_Signature.AA.V': SCRIPT_HASHES.officialSignature,
  'Participant_Signing_Date.AA.F': SCRIPT_HASHES.dateFormat,
  'Official_Signing_Date.AA.F': SCRIPT_HASHES.dateFormat,
  'Participant_Style.AA.V': SCRIPT_HASHES.participantStyle,
  'Official_Style.AA.V': SCRIPT_HASHES.officialStyle,
  'Finalize_Form.A': SCRIPT_HASHES.finalize,
};
const DOCUMENT_SCRIPT_NAME = 'd48b6448-cce1-4cfb-a0f0-f21e3228666a';
const FORBIDDEN_ACTIONS = new Set([
  'Launch', 'GoToR', 'GoToE', 'ImportData', 'SubmitForm', 'URI', 'Rendition',
  'RichMediaExecute', 'Movie', 'Sound', 'Named', 'Hide', 'ResetForm', 'SetOCGState',
  'Trans', 'GoTo3DView', 'Thread',
]);
const FORBIDDEN_KEYS = new Set(['XFA', 'RichMediaContent', 'RichMediaSettings', 'FFilter', 'FDecodeParms']);
const FORBIDDEN_TYPES = new Set(['FileAttachment', 'RichMedia', 'Movie', 'Sound', '3D']);
const MAX_SCRIPT_BYTES = 8192;
// The original contains two provenance-only JUMBF/C2PA blobs, including one
// mislabeled application/pdf. Neither begins with %PDF. These exact immutable
// byte hashes AND catalog associations are the only embedded-file exceptions.
const CREDENTIALS = {
  associated: { filename: 'Acro0000A8BF', mime: 'application/pdf', size: 57144,
    hash: '958a5c0651a24a1b0665610e4e250dbd046549b7b85fb8a19b6074c1633a11d4',
    keys: ['AFRelationship', 'EF', 'F', 'Type', 'UF'] },
  named: { filename: 'Content Credentials', mime: 'application/c2pa', size: 24296,
    hash: 'e037d884bdfbaf0b1f5197326c8de22ac2f0b005c7a41597074d76beefaa536e',
    keys: ['AFRelationship', 'Desc', 'EF', 'F', 'Subtype', 'Type', 'UF'] },
};

function decodedStreamBytes(stream, maxBytes, resolve) {
  const filter = resolve(stream.dict.get(PDFName.of('Filter')));
  if (stream.dict.has(PDFName.of('F')) || stream.dict.has(PDFName.of('DecodeParms'))) throw new Error('External or unsupported stream');
  let bytes;
  if (!filter) bytes = stream.contents;
  else if (filter instanceof PDFName && filter.decodeText() === 'FlateDecode') bytes = inflateSync(stream.contents, { maxOutputLength: maxBytes });
  else throw new Error('Unsupported stream encoding');
  if (!bytes.length || bytes.length > maxBytes) throw new Error('Stream size limit');
  return bytes;
}

function activeContentAllowed(document) {
  const resolve = (value) => document.context.lookup(value);
  const value = (dict, key) => resolve(dict.get(PDFName.of(key)));
  const name = (object) => object instanceof PDFName ? object.decodeText() : null;
  const allowedScripts = new Set();
  const allowedFileSpecs = new Set();
  const allowedEmbeddedStreams = new Set();
  const scriptContexts = new Set();
  const dictionaries = [];
  const seen = new Set();
  const pending = document.context.enumerateIndirectObjects().map(([, object]) => object);
  pending.push(document.catalog);
  while (pending.length) {
    const object = pending.pop();
    if (!object || seen.has(object)) continue;
    seen.add(object);
    if (seen.size > 100000 || pending.length > 100000) throw new Error('Object graph limit');
    if (object instanceof PDFRef) {
      const target = resolve(object);
      if (!target) throw new Error('Unresolved object');
      pending.push(target);
    } else if (object instanceof PDFStream) {
      if (object.dict.has(PDFName.of('F'))) throw new Error('External stream');
      pending.push(object.dict);
    }
    else if (object instanceof PDFArray) pending.push(...object.asArray());
    else if (object instanceof PDFDict) {
      dictionaries.push(object);
      pending.push(...object.values());
    }
  }

  function scriptHash(action) {
    const script = value(action, 'JS');
    let bytes;
    if (script instanceof PDFString || script instanceof PDFHexString) bytes = script.asBytes();
    else if (script instanceof PDFRawStream) bytes = decodedStreamBytes(script, MAX_SCRIPT_BYTES, resolve);
    else throw new Error('Unsupported script object');
    if (!bytes.length || bytes.length > MAX_SCRIPT_BYTES) throw new Error('Script size limit');
    return createHash('sha256').update(bytes).digest('hex');
  }

  function actionAllowed(rawAction, expectedHash, context) {
    const action = resolve(rawAction);
    if (!(action instanceof PDFDict)) throw new Error('Unknown action object');
    const subtype = name(value(action, 'S'));
    if (action.has(PDFName.of('Next'))) throw new Error('Action chains are not supported');
    if (subtype === 'GoTo' && !action.has(PDFName.of('JS'))) return;
    if (subtype !== 'JavaScript' || !expectedHash || scriptHash(action) !== expectedHash || scriptContexts.has(context)) {
      throw new Error('Unapproved action');
    }
    scriptContexts.add(context);
    allowedScripts.add(action);
  }

  function fieldName(dict) {
    const visited = new Set();
    let current = dict;
    for (let depth = 0; current instanceof PDFDict && depth < 32; depth += 1) {
      if (visited.has(current)) return null;
      visited.add(current);
      const field = value(current, 'T');
      if (field instanceof PDFString || field instanceof PDFHexString) return field.decodeText();
      current = value(current, 'Parent');
    }
    return null;
  }

  const catalogNames = value(document.catalog, 'Names');
  function approveCredential(rawSpec, expected) {
    const spec = resolve(rawSpec);
    if (!(spec instanceof PDFDict) || name(value(spec, 'Type')) !== 'Filespec' || name(value(spec, 'AFRelationship')) !== 'C2PA_Manifest') throw new Error('Unapproved attachment');
    if (spec.keys().map((key) => key.decodeText()).sort().join('|') !== expected.keys.slice().sort().join('|')) throw new Error('Unexpected attachment properties');
    for (const key of ['F', 'UF']) {
      const filename = value(spec, key);
      if (!(filename instanceof PDFString || filename instanceof PDFHexString) || filename.decodeText() !== expected.filename) throw new Error('Unapproved attachment');
    }
    const embedded = value(spec, 'EF');
    if (!(embedded instanceof PDFDict) || embedded.keys().length !== 1 || !embedded.has(PDFName.of('F'))) throw new Error('Unapproved attachment streams');
    const stream = value(embedded, 'F');
    if (!(stream instanceof PDFRawStream) || name(value(stream.dict, 'Subtype')) !== expected.mime) throw new Error('Unapproved attachment type');
    const bytes = decodedStreamBytes(stream, 65536, resolve);
    const buffer = Buffer.from(bytes);
    if (bytes.length !== expected.size || buffer.readUInt32BE(0) !== expected.size || buffer.subarray(4, 8).toString('ascii') !== 'jumb'
      || buffer.subarray(12, 16).toString('ascii') !== 'jumd' || createHash('sha256').update(bytes).digest('hex') !== expected.hash) throw new Error('Unapproved attachment bytes');
    allowedFileSpecs.add(spec);
    allowedEmbeddedStreams.add(stream.dict);
  }
  const associatedFiles = value(document.catalog, 'AF');
  if (associatedFiles) {
    if (!(associatedFiles instanceof PDFArray) || associatedFiles.size() !== 1) throw new Error('Unapproved associated files');
    approveCredential(associatedFiles.get(0), CREDENTIALS.associated);
  }
  if (catalogNames instanceof PDFDict && catalogNames.has(PDFName.of('EmbeddedFiles'))) {
    const tree = value(catalogNames, 'EmbeddedFiles');
    const entries = tree instanceof PDFDict ? value(tree, 'Names') : null;
    if (!(entries instanceof PDFArray) || entries.size() !== 2 || tree.keys().some((key) => key.decodeText() !== 'Names')) throw new Error('Unapproved embedded file tree');
    const entryName = resolve(entries.get(0));
    if (!(entryName instanceof PDFString || entryName instanceof PDFHexString) || entryName.decodeText() !== CREDENTIALS.named.filename) throw new Error('Unapproved embedded file name');
    approveCredential(entries.get(1), CREDENTIALS.named);
  }
  function documentScripts(rawTree, visited = new Set()) {
    const tree = resolve(rawTree);
    if (!(tree instanceof PDFDict) || visited.has(tree) || visited.size > 100) throw new Error('Unknown script name tree');
    visited.add(tree);
    const entries = value(tree, 'Names');
    if (entries) {
      if (!(entries instanceof PDFArray) || entries.size() % 2 || entries.size() > 100) throw new Error('Unknown script names');
      for (let index = 0; index < entries.size(); index += 2) {
        const entryName = resolve(entries.get(index));
        if (!(entryName instanceof PDFString || entryName instanceof PDFHexString) || entryName.decodeText() !== DOCUMENT_SCRIPT_NAME) throw new Error('Unapproved document script');
        actionAllowed(entries.get(index + 1), SCRIPT_HASHES.calculate, `document:${DOCUMENT_SCRIPT_NAME}`);
      }
    }
    const kids = value(tree, 'Kids');
    if (kids) {
      if (!(kids instanceof PDFArray) || kids.size() > 100) throw new Error('Unknown script name tree');
      for (const kid of kids.asArray()) documentScripts(kid, visited);
    }
  }

  for (const dict of dictionaries) {
    const type = name(value(dict, 'Type'));
    const subtype = name(value(dict, 'Subtype'));
    const actionType = name(value(dict, 'S'));
    if (FORBIDDEN_TYPES.has(type) || FORBIDDEN_TYPES.has(subtype) || FORBIDDEN_ACTIONS.has(actionType)) throw new Error('Forbidden active content');
    if ((type === 'Filespec' || dict.has(PDFName.of('EF'))) && !allowedFileSpecs.has(dict)) throw new Error('Unapproved attachment');
    if (type === 'EmbeddedFile' && !allowedEmbeddedStreams.has(dict)) throw new Error('Unapproved embedded file');
    if (type === 'Action' && !['JavaScript', 'GoTo'].includes(actionType)) throw new Error('Unknown action type');
    const field = fieldName(dict);
    for (const [key, object] of dict.entries()) {
      const keyName = key.decodeText();
      if (FORBIDDEN_KEYS.has(keyName)) throw new Error('Forbidden active content');
      if (keyName === 'AF' && dict !== document.catalog) throw new Error('Unapproved associated files');
      if (keyName === 'EmbeddedFiles' && dict !== catalogNames) throw new Error('Unapproved embedded file tree');
      if (keyName === 'A') actionAllowed(object, FIELD_SCRIPTS[`${field}.A`], `${field}.A`);
      if (keyName === 'AA') {
        const actions = resolve(object);
        if (!(actions instanceof PDFDict)) throw new Error('Unknown additional actions');
        for (const [event, action] of actions.entries()) {
          const context = `${field}.AA.${event.decodeText()}`;
          actionAllowed(action, FIELD_SCRIPTS[context], context);
        }
      }
      if (keyName === 'OpenAction') {
        const action = resolve(object);
        if (action instanceof PDFDict) actionAllowed(action, null, 'open');
        else if (!(action instanceof PDFArray || action instanceof PDFName || action instanceof PDFString)) throw new Error('Unknown open action');
      }
      if (keyName === 'JavaScript') {
        if (dict !== catalogNames) throw new Error('Unexpected JavaScript tree');
        documentScripts(object);
      }
    }
  }
  // Check unreferenced objects too. No hidden unknown JavaScript dictionary is
  // accepted simply because one viewer happens not to follow its reference.
  for (const dict of dictionaries) {
    if ((dict.has(PDFName.of('JS')) || name(value(dict, 'S')) === 'JavaScript') && !allowedScripts.has(dict)) throw new Error('Unapproved JavaScript');
  }
  return true;
}

(async () => {
  try {
    const document = await PDFDocument.load(workerData, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
      parseSpeed: ParseSpeeds.Fast,
    });
    const pages = document.getPageCount();
    const objectCount = document.context.enumerateIndirectObjects().length;
    if (!(pages > 0 && pages <= 50 && objectCount <= 20000)) {
      parentPort.postMessage({ valid: false, reason: 'invalid' });
      return;
    }
    try {
      activeContentAllowed(document);
      parentPort.postMessage({ valid: true });
    } catch {
      parentPort.postMessage({ valid: false, reason: 'active_content' });
    }
  } catch {
    parentPort.postMessage({ valid: false });
  }
})();
