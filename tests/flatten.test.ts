import { describe, expect, it } from 'vitest';
import { flatten, itemCells, itemsOf, parseNumber, readPath, scalarText, toCsv, toMarkdown } from '../src/flatten';
import { propertyName } from '../src/view';
import { GROWTH_LIMIT, growth } from './growth';

describe('helpers', () => {
	it('reads a property path, whole key first, then split, without case', () => {
		expect(readPath({ A: { b: [1] } }, 'a.B')).toEqual([1]);
		expect(readPath({ 'a.b': 2, a: { b: 3 } }, 'a.b')).toBe(2);
		expect(readPath(null, 'x')).toBeUndefined();
		expect(readPath({ a: 1 }, 'a.b')).toBeUndefined();
	});

	it('turns values into cell text', () => {
		expect(scalarText(null)).toBe('');
		expect(scalarText(3)).toBe('3');
		expect(scalarText(false)).toBe('false');
		expect(scalarText(new Date('2026-10-10T00:00:00Z'))).toBe('2026-10-10');
		expect(scalarText(['a', { b: 1 }])).toBe('a, {"b":1}');
	});

	it('items: a list, one value, or nothing', () => {
		expect(itemsOf(['a', null, 'b'])).toEqual(['a', 'b']);
		expect(itemsOf('x')).toEqual(['x']);
		expect(itemsOf('')).toEqual([]);
		expect(itemsOf(undefined)).toEqual([]);
	});

	it('stops at a depth of 4 and writes deeper objects as JSON', () => {
		const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
		expect(itemCells(deep)).toEqual([['a.b.c.d.e', '{"f":1}']]);
	});

	it('parses numbers with signs and separators', () => {
		expect(parseNumber('$1,200.50')).toBe(1200.5);
		expect(parseNumber('12 %')).toBe(12);
		expect(parseNumber('\u22123')).toBe(-3);
		expect(parseNumber('2026-10-10')).toBeNull();
		expect(parseNumber('')).toBeNull();
	});

	it('property names from the picker lose the note. prefix', () => {
		expect(propertyName('note.milestones')).toBe('milestones');
		expect(propertyName(' roles ')).toBe('roles');
		expect(propertyName(5)).toBe('');
	});
});

describe('export', () => {
	const r = flatten([{ path: 'Folder/A b.md', frontmatter: { x: [{ t: 'a|b', n: 'x, "y"' }] } }], { property: 'x' });
	it('Markdown escapes pipes and links the source note', () => {
		expect(toMarkdown(r)).toBe('| Source | t | n |\n| --- | --- | --- |\n| [[Folder/A b\\|A b]] | a\\|b | x, "y" |\n');
		expect(toMarkdown(r, false)).toBe('| t | n |\n| --- | --- |\n| a\\|b | x, "y" |\n');
	});
	it('CSV quotes fields with commas and quotes', () => {
		expect(toCsv(r)).toBe('Source,t,n\r\nFolder/A b.md,a|b,"x, ""y"""\r\n');
	});
});

describe('scale', () => {
	// A wall-clock limit (150 ms strict, 2,000 ms default) depends on the speed of the runner; a CI runner can be 9
	// times slower than the agent Mac. The guard divides the time for 2,000 notes by the time for 200 notes, lowest
	// time of each size over 5 rounds, both measured in this test (s1103b ASSERT-B, Procedure AC).
	const notesOf = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			path: `P/${i}.md`,
			frontmatter: { m: Array.from({ length: 5 }, (_, j) => ({ step: `S${j}`, hours: (i * 7 + j) % 13, due: `2026-${String(1 + (j % 12)).padStart(2, '0')}-01` })) },
		}));
	const options = { property: 'm', sort: { column: 'hours', dir: 'desc' }, filter: { column: 'step', op: 'not-equals', value: 'S0' } } as const;
	it('flattens 2,000 notes with 5 items each, sorted, in linear time', () => {
		const r = flatten(notesOf(2000), options);
		expect(r.rows).toHaveLength(8000);
		expect(r.rows[0]!.cells[1]).toBe('12');
		const g = growth((n) => {
			const notes = notesOf(n);
			return () => flatten(notes, options);
		}, 2000);
		expect(g.ratio, g.text).toBeLessThan(GROWTH_LIMIT);
	});
});
