import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const memberUploadSurfaces = [
  'app/(portal)/dashboard/resume/ResumeClient.tsx',
  'components/portal/ResumeMobileResumeTools.tsx',
  'components/portal/MobileProfileSkillsResume.tsx',
];

test('member resume surfaces lock every file input behind one in-flight upload guard', () => {
  for (const relativePath of memberUploadSurfaces) {
    const source = read(relativePath);
    assert.match(
      source,
      /const uploadInFlightRef = useRef\(false\)/,
      `${relativePath} needs a synchronous upload lock`,
    );
    assert.match(
      source,
      /if \(uploadInFlightRef\.current\) return;/,
      `${relativePath} needs a hard handler guard`,
    );
    assert.match(
      source,
      /uploadInFlightRef\.current = true;[\s\S]*uploadInFlightRef\.current = false;/,
      `${relativePath} must acquire and release its upload lock`,
    );
    assert.match(
      source,
      /aria-busy=\{uploading\}/,
      `${relativePath} must expose its busy state to assistive technology`,
    );

    const fileInputs = source.match(/<input[\s\S]*?type="file"[\s\S]*?\/>/g) ?? [];
    assert.ok(fileInputs.length > 0, `${relativePath} should contain a file input`);
    const hasPreviewFixture = relativePath === 'app/(portal)/dashboard/resume/ResumeClient.tsx';
    const disabledGuard = hasPreviewFixture
      ? /disabled=\{\s*!!previewData\s*\|\|\s*uploading\s*\}/
      : /disabled=\{\s*uploading\s*\}/;
    for (const input of fileInputs) {
      assert.match(
        input,
        disabledGuard,
        `${relativePath} must disable file inputs while uploading${hasPreviewFixture ? ' and in preview fixtures' : ''}`,
      );
    }
  }
});

test('drop and click entry points cannot bypass the member resume upload lock', () => {
  for (const relativePath of memberUploadSurfaces.slice(0, 2)) {
    const source = read(relativePath);
    assert.match(
      source,
      /const handleDrop[\s\S]*?if \(uploadInFlightRef\.current\) return;/,
      `${relativePath} must reject a second dropped file`,
    );
  }

  for (const relativePath of memberUploadSurfaces) {
    const source = read(relativePath);
    assert.match(
      source,
      /if \(!uploadInFlightRef\.current\) file(?:Input)?Ref\.current\?\.click\(\)/,
      `${relativePath} must guard programmatic file-picker clicks`,
    );
  }
});

const aiResumeUploadForms = [
  'components/portal/tools/GapAnalyzerForm.tsx',
  'components/portal/tools/JobMatchScorerForm.tsx',
  'components/portal/tools/ResumeRewriterForm.tsx',
];

test('AI resume upload forms preserve and visibly announce the API extraction warning', () => {
  for (const relativePath of aiResumeUploadForms) {
    const source = read(relativePath);
    assert.match(source, /const \[extractionWarning, setExtractionWarning\] = useState<string \| null>\(null\)/);
    assert.match(source, /const warning = data\.extractionWarning/);
    assert.match(source, /typeof warning === 'string' && warning\.trim\(\)/);
    assert.match(source, /role="status"[\s\S]*?\{extractionWarning\}/);
  }
});

test('mobile profile resume preview never exposes storage keys and uses format-specific member endpoints', () => {
  const source = read('components/portal/MobileProfileSkillsResume.tsx');

  assert.doesNotMatch(
    source,
    /resumeOriginalPath\?\.split\(['"]\/?['"]\)\.pop\(\)/,
    'the storage object basename must not be rendered as the member-facing filename',
  );
  assert.match(source, /resumeLabel\(extensionFromPath\(resumeOriginalPath\)\)/);
  assert.match(source, /fetch\('\/api\/member\/resume', \{ cache: 'no-store' \}\)/);
  assert.match(source, /kind: 'pdf', src: proxyPath/);
  assert.match(source, /\/api\/member\/resume\/docx-html\?variant=original&v=/);
  assert.match(source, /srcDoc=\{documentShell\(preview\.html\)\}/);
  assert.match(source, /sandbox=""/);
  assert.match(source, /const textResponse = await fetch\(proxyPath/);
  assert.match(source, /const text = await textResponse\.text\(\)/);
  assert.match(source, /<pre[\s\S]*?\{preview\.text/);
  assert.match(
    source,
    /setPreview\(null\);[\s\S]*await refreshResumeState\(shouldReloadPreview\)/,
    'a successful replacement must invalidate and refetch an open preview',
  );
});

test('desktop resume previews reset failed and stale revision state before loading replacements', () => {
  const source = read('app/(portal)/dashboard/resume/ResumeClient.tsx');

  assert.match(
    source,
    /setOriginalPdfFailed\(false\);[\s\S]*\[resumeData\?\.previewOriginalPath\]/,
  );
  assert.match(
    source,
    /setEnhancedPdfFailed\(false\);[\s\S]*\[resumeData\?\.previewEnhancedPath\]/,
  );
  assert.match(
    source,
    /setOriginalDocHtml\(null\);\s*const revision = resumeData\.previewOriginalPath/,
  );
  assert.match(
    source,
    /setEnhancedDocHtml\(null\);\s*const revision = resumeData\.previewEnhancedPath/,
  );
  assert.match(source, /cache: "no-store"/);
});
