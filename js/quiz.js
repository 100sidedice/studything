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

export function scoreChoiceSelection(question, selectedIndex) {
	return selectedIndex === question.correctIndex;
}

// Backward-compatible aliases
export const generateQuestionSet = generateChoiceQuestionSet;
export const scoreSelection = scoreChoiceSelection;

function makeQuestion({ casesByName, itemName, section }) {
	const correct = casesByName[itemName][section];
	const otherItemNames = Object.keys(casesByName).filter((n) => n !== itemName && hasAnswer(casesByName, n, section));
	shuffleInPlace(otherItemNames);

	const wrongChoices = otherItemNames.slice(0, 3).map((n) => casesByName[n][section]);
	if (wrongChoices.length < 3) {
		throw new Error(`Not enough wrong choices for section "${section}". Add more items with this field.`);
	}

	const options = shuffleCopy([correct, ...wrongChoices]);
	return {
		itemName,
		section,
		prompt: `Which ${section} matches this item?`,
		correct,
		options,
		correctIndex: options.indexOf(correct),
	};
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
