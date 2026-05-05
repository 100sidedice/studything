export async function loadStudyData(url = 'answers.json') {
	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) {
		throw new Error(`Failed to load ${url} (${res.status})`);
	}
	const json = await res.json();
	if (!json || typeof json !== 'object') {
		throw new Error('Invalid JSON root');
	}
	return normalizeStudyJson(json);
}

function normalizeStudyJson(root) {
	const groupNames = Object.keys(root).filter((k) => root[k] && typeof root[k] === 'object');
	if (groupNames.length === 0) {
		throw new Error('No groups found in JSON');
	}

	/** @type {Record<string, {sections: string[], cases: Record<string, Record<string,string>>}>} */
	const groups = {};

	for (const groupName of groupNames) {
		const groupObj = root[groupName];
		const sections = Array.isArray(groupObj['[Sections]']) ? groupObj['[Sections]'].filter(isNonEmptyString) : inferSections(groupObj);

		const cases = {};
		for (const [caseName, record] of Object.entries(groupObj)) {
			if (caseName === '[Sections]') continue;
			if (!record || typeof record !== 'object') continue;

			const normalizedRecord = {};
			for (const section of sections) {
				const value = record[section];
				if (isNonEmptyString(value)) normalizedRecord[section] = value.trim();
			}

			if (Object.keys(normalizedRecord).length > 0) {
				cases[caseName] = normalizedRecord;
			}
		}

		groups[groupName] = { sections, cases };
	}

	return { groups };
}

function inferSections(groupObj) {
	const sectionSet = new Set();
	for (const [key, value] of Object.entries(groupObj)) {
		if (key === '[Sections]') continue;
		if (!value || typeof value !== 'object') continue;
		for (const sec of Object.keys(value)) {
			if (isNonEmptyString(sec)) sectionSet.add(sec);
		}
	}
	return [...sectionSet];
}

function isNonEmptyString(v) {
	return typeof v === 'string' && v.trim().length > 0;
}
