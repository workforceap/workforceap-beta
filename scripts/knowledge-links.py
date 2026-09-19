#!/usr/bin/env python3
"""Validate local inline Markdown links in the KB without network access.

This is a bounded inline-link checker, not a complete CommonMark renderer.
Reference-style links, raw HTML anchors/links and indented code blocks are not
parsed. Fenced and inline code examples are excluded while offsets are preserved.
"""
import html
import re
import subprocess
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit


def _escaped(text, position):
    preceding = position - 1
    while preceding >= 0 and text[preceding] == '\\':
        preceding -= 1
    return (position - preceding - 1) % 2 == 1


def _blank(text):
    return ''.join('\n' if character == '\n' else ' ' for character in text)


def _mask_fences(text):
    output = []
    fence = None
    for line in text.splitlines(keepends=True):
        match = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line.rstrip('\r\n'))
        if fence is not None:
            output.append(_blank(line))
            if (match and match[1][0] == fence[0] and len(match[1]) >= fence[1]
                    and not match[2].strip()):
                fence = None
        elif match and not (match[1][0] == '`' and '`' in match[2]):
            fence = (match[1][0], len(match[1]))
            output.append(_blank(line))
        else:
            output.append(line)
    return ''.join(output)


def _mask_code(text):
    masked = _mask_fences(text)
    output = list(masked)
    cursor = 0
    while cursor < len(masked):
        start = masked.find('`', cursor)
        if start < 0:
            break
        if _escaped(masked, start):
            cursor = start + 1
            continue
        opening = re.match(r'`+', masked[start:])[0]
        after = start + len(opening)
        closing = re.search(r'(?<!`)`{' + str(len(opening)) + r'}(?!`)', masked[after:])
        if closing is None:
            cursor = after
            continue
        end = after + closing.end()
        output[start:end] = _blank(masked[start:end])
        cursor = end
    return ''.join(output)


def _unescape(value):
    return html.unescape(re.sub(r'\\([!"#$%&\'()*+,\-./:;<=>?@\[\]\\^_`{|}~])', r'\1', value))


def _finish_link(text, cursor):
    """Consume optional whitespace/title and the required outer parenthesis."""
    before_space = cursor
    while cursor < len(text) and text[cursor].isspace():
        cursor += 1
    if cursor < len(text) and text[cursor] == ')':
        return cursor + 1
    if (cursor == before_space or cursor >= len(text)
            or text[cursor] not in ('"', "'", '(')):
        return None
    closing = ')' if text[cursor] == '(' else text[cursor]
    cursor += 1
    while cursor < len(text):
        if text[cursor] == '\\':
            cursor += 2
        elif text[cursor] == closing:
            cursor += 1
            while cursor < len(text) and text[cursor].isspace():
                cursor += 1
            return cursor + 1 if cursor < len(text) and text[cursor] == ')' else None
        else:
            cursor += 1
    return None


def _destination(text, cursor):
    while cursor < len(text) and text[cursor].isspace():
        cursor += 1
    begin = cursor
    if cursor < len(text) and text[cursor] == '<':
        begin = cursor = cursor + 1
        while cursor < len(text):
            if text[cursor] in '\r\n':
                return None, cursor
            if text[cursor] == '\\':
                cursor += 2
            elif text[cursor] == '>':
                end = _finish_link(text, cursor + 1)
                return (_unescape(text[begin:cursor]), end) if end else (None, cursor + 1)
            else:
                cursor += 1
        return None, cursor
    depth = 0
    while cursor < len(text):
        character = text[cursor]
        if character == '\\':
            cursor += 2
            continue
        if character.isspace() or (character == ')' and depth == 0):
            end = _finish_link(text, cursor)
            return (_unescape(text[begin:cursor]), end) if end and depth == 0 else (None, cursor + 1)
        if character == '(':
            depth += 1
        elif character == ')':
            depth -= 1
        cursor += 1
    return None, cursor


def destinations(text):
    """Yield original offsets and decoded destinations, or None for bad syntax."""
    visible = _mask_code(text)
    offset = 0
    while True:
        start = visible.find('](', offset)
        if start < 0:
            return
        if _escaped(visible, start):
            offset = start + 2
            continue
        destination, end = _destination(text, start + 2)
        yield start, destination
        offset = max(start + 2, end)


def headings(text):
    counts = {}
    result = set()
    for line in _mask_fences(text).splitlines():
        match = re.match(r'^ {0,3}#{1,6}\s+(.+?)\s*#*$', line)
        if not match:
            continue
        title = re.sub(r'<[^>]+>', '', html.unescape(match.group(1))).lower()
        slug = ''.join(c for c in title if c in ' -_' or unicodedata.category(c)[0] in 'LN').replace(' ', '-')
        count = counts.get(slug, 0)
        candidate = slug if count == 0 else f'{slug}-{count}'
        while candidate in result:
            count += 1
            candidate = f'{slug}-{count}'
        counts[slug] = count + 1
        result.add(candidate)
    return result


def validate(root, files=None):
    """Return counts and failures for local sources; never request external URLs."""
    root = Path(root).resolve()
    failures = []
    checked = 0
    text_cache = {}
    sources = files if files is not None else (root / 'docs/knowledge-base').rglob('*.md')
    for file in sorted(sources):
        file = Path(file)
        if not file.resolve().is_relative_to(root):
            failures.append(f'{file}: source outside repository')
            continue
        text = file.read_text()
        for offset, destination in destinations(text):
            location = f'{file.relative_to(root).as_posix()}:{text[:offset].count(chr(10)) + 1}'
            if destination is None:
                failures.append(f'{location}: malformed or unclosed link')
                continue
            try:
                parts = urlsplit(destination)
            except ValueError:
                failures.append(f'{location}: malformed destination {destination}')
                continue
            if parts.scheme in ('http', 'https', 'mailto', 'data', 'tel') or parts.netloc:
                continue
            if parts.scheme:
                failures.append(f'{location}: unsupported destination scheme {parts.scheme}')
                continue
            target = (file.parent / unquote(parts.path)).resolve() if parts.path else file
            checked += 1
            if not target.is_relative_to(root) or not target.exists():
                failures.append(f'{location}: missing/outside-repository {destination}')
                continue
            if not parts.fragment or target.is_dir():
                continue
            if target not in text_cache:
                text_cache[target] = target.read_text(errors='replace')
            target_text = text_cache[target]
            fragment = unquote(parts.fragment)
            code_line = re.fullmatch(r'L(\d+)(?:-L(\d+))?', fragment)
            if code_line:
                first = int(code_line.group(1))
                last = int(code_line.group(2) or code_line.group(1))
                valid = 1 <= first <= last <= len(target_text.splitlines())
            else:
                valid = fragment in headings(target_text) if target.suffix in ('.md', '.mdx') else True
            if not valid:
                failures.append(f'{location}: missing anchor {destination}')
    return checked, failures


def main():
    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()).resolve()
    checked, failures = validate(root)
    print(f'Checked {checked} local KB links; {len(failures)} failures.')
    for failure in failures:
        print(failure)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
