export function generateTypingQuestionSet({ itemsByName, sections, count }) {
	const itemNames = Object.keys(itemsByName);
	if (itemNames.length === 0) {
		throw new Error('No items found in this group.');
	}
	if (!Array.isArray(sections) || sections.length === 0) {
		throw new Error('No sections found for this group.');
	}

	const pairs = [];
	for (const itemName of itemNames) {
		for (const section of sections) {
			const v = itemsByName[itemName]?.[section];
			if (typeof v === 'string' && v.trim().length > 0) {
				pairs.push({ itemName, section, clue: v.trim() });
			}
		}
	}

	if (pairs.length === 0) {
		throw new Error('No usable item/section values found to generate typing questions.');
	}

	shuffleInPlace(pairs);
	const desired = Math.max(1, Number(count) || 20);
	const questions = [];
	const used = new Set();

	while (questions.length < desired) {
		let pair = pairs[questions.length % pairs.length];
		if (!pair) break;

		let guard = 0;
		while (used.has(keyFor(pair)) && guard++ < 200) {
			pair = pairs[Math.floor(Math.random() * pairs.length)];
		}
		used.add(keyFor(pair));

		questions.push({
			id: questions.length + 1,
			itemName: pair.itemName,
			section: pair.section,
			prompt: `Type the item name for this ${pair.section}:`,
			clue: pair.clue,
			answer: pair.itemName,
		});
	}

	return questions;
}

export function isTypingCorrect(question, userInput) {
	if (!question) return false;
	const expected = normalizeAnswer(question.answer || question.itemName || '');
	const got = normalizeAnswer(userInput || '');
	return expected.length > 0 && expected === got;
}

export function makeMask(answer, revealed) {
	const s = String(answer || '');
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (!isMaskableChar(ch)) {
			out += ch;
			continue;
		}
		out += revealed.has(i) ? ch : '•';
	}
	return out;
}

export function makeMaskTokens(answer, revealed) {
	const s = String(answer || '');
	/** @type {Array<{answerIndex:number, original:string, kind:'mask'|'space'|'punct', revealed:boolean}>} */
	const tokens = [];
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === ' ') {
			tokens.push({ answerIndex: i, original: ch, kind: 'space', revealed: true });
			continue;
		}
		if (!isMaskableChar(ch)) {
			tokens.push({ answerIndex: i, original: ch, kind: 'punct', revealed: true });
			continue;
		}
		tokens.push({ answerIndex: i, original: ch, kind: 'mask', revealed: revealed.has(i) });
	}
	return tokens;
}

export function revealNextHintIndex(answer, revealed) {
	const s = String(answer || '');
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (!isMaskableChar(ch)) continue;
		if (!revealed.has(i)) return i;
	}
	return null;
}

function isMaskableChar(ch) {
	return /[A-Za-z0-9]/.test(ch);
}

function normalizeAnswer(s) {
	return String(s)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, ' ');
}

function keyFor(pair) {
	return `${pair.itemName}__${pair.section}`;
}

function shuffleInPlace(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}
