export function generateChoiceQuestionSet({ casesByName, sections, count }) {
	const caseNames = Object.keys(casesByName);
	if (caseNames.length < 4) {
		throw new Error('Need at least 4 items in a group to generate 4-choice questions.');
	}
	if (!Array.isArray(sections) || sections.length === 0) {
		throw new Error('No sections found for this group.');
	}

	const allPairs = [];
	for (const itemName of caseNames) {
		for (const section of sections) {
			const val = casesByName[itemName]?.[section];
			if (typeof val === 'string' && val.trim().length > 0) {
				allPairs.push({ itemName, section });
			}
		}
	}

	shuffleInPlace(allPairs);
	const desired = Math.max(1, Number(count) || 20);
	const questions = [];
	const used = new Set();

	while (questions.length < desired) {
		let pair = allPairs[questions.length % allPairs.length];
		if (!pair) break;

		// avoid repeating the same case+section until we must
		let guard = 0;
		while (used.has(keyFor(pair)) && guard++ < 200) {
			pair = allPairs[Math.floor(Math.random() * allPairs.length)];
		}
		used.add(keyFor(pair));

		const q = makeQuestion({ casesByName, itemName: pair.itemName, section: pair.section });
		questions.push({ ...q, id: questions.length + 1 });
	}

	return questions;
}

/**
 * Returns all possible (itemName, section) pairs that have a non-empty answer.
 * Useful for modes that operate over the full pool (e.g. mastery).
 */
export function getChoiceQuestionPairs({ casesByName, sections }) {
	const caseNames = Object.keys(casesByName);
	if (caseNames.length < 4) {
		throw new Error('Need at least 4 items in a group to generate 4-choice questions.');
	}
	if (!Array.isArray(sections) || sections.length === 0) {
		throw new Error('No sections found for this group.');
	}

	const pairs = [];
	for (const itemName of caseNames) {
		for (const section of sections) {
			const val = casesByName[itemName]?.[section];
			if (typeof val === 'string' && val.trim().length > 0) {
				pairs.push({ itemName, section });
			}
		}
	}
	return pairs;
}

/**
 * Builds a single 4-choice question for a specific (itemName, section) pair.
 */
export function makeChoiceQuestion({ casesByName, itemName, section }) {
	return makeQuestion({ casesByName, itemName, section });
}

export function scoreChoiceSelection(question, selectedIndex) {
	return selectedIndex === question.correctIndex;
}

// Backward-compatible aliases
export const generateQuestionSet = generateChoiceQuestionSet;
export const scoreSelection = scoreChoiceSelection;

function makeQuestion({ casesByName, itemName, section }) {
	const correct = String(casesByName[itemName][section]).trim();
	const correctNorm = normalizeOptionText(correct);
	const otherItemNames = Object.keys(casesByName).filter((n) => n !== itemName && hasAnswer(casesByName, n, section));
	shuffleInPlace(otherItemNames);

	const wrongChoices = pickUniqueWrongChoices({ casesByName, section, otherItemNames, correctNorm, count: 3 });
	const options = shuffleCopy([{ text: correct, sourceItemName: itemName }, ...wrongChoices]);
	return {
		itemName,
		section,
		prompt: `Which ${section} matches this item?`,
		correct,
		options,
		correctIndex: options.findIndex((o) => o.sourceItemName === itemName && o.text === correct),
	};
}

function pickUniqueWrongChoices({ casesByName, section, otherItemNames, correctNorm, count }) {
	const choices = [];
	const usedNorm = new Set([correctNorm]);

	for (const n of otherItemNames) {
		const raw = casesByName[n]?.[section];
		if (typeof raw !== 'string') continue;
		const text = raw.trim();
		if (!text) continue;
		const norm = normalizeOptionText(text);
		if (!norm) continue;
		if (usedNorm.has(norm)) continue;
		usedNorm.add(norm);
		choices.push({ text, sourceItemName: n });
		if (choices.length >= count) break;
	}

	if (choices.length < count) {
		throw new Error(
			`Not enough unique wrong choices for section "${section}". ` +
			`Some items share the exact same answer text. Add more items or vary the text so 4 unique options exist.`
		);
	}

	return choices;
}

function normalizeOptionText(s) {
	return String(s)
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function hasAnswer(casesByName, caseName, section) {
	const v = casesByName[caseName]?.[section];
	return typeof v === 'string' && v.trim().length > 0;
}

function keyFor(pair) {
	return `${pair.itemName}__${pair.section}`;
}

function shuffleCopy(arr) {
	const copy = [...arr];
	shuffleInPlace(copy);
	return copy;
}

function shuffleInPlace(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}
