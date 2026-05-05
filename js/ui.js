import { loadStudyData } from './data.js';
import { generateChoiceQuestionSet, getChoiceQuestionPairs, makeChoiceQuestion, scoreChoiceSelection } from './quiz.js';
import { generateTypingQuestionSet, isTypingCorrect, makeMaskTokens, revealNextHintIndex } from './typing.js';

const els = {
	screenGroup: document.getElementById('screenGroup'),
	screenQuiz: document.getElementById('screenQuiz'),
	screenDone: document.getElementById('screenDone'),
	groupSelect: document.getElementById('groupSelect'),
	questionCount: document.getElementById('questionCount'),
	timePerQuestion: document.getElementById('timePerQuestion'),
	modeSelect: document.getElementById('modeSelect'),
	startBtn: document.getElementById('startBtn'),
	loadError: document.getElementById('loadError'),
	dataStatus: document.getElementById('dataStatus'),

	progressText: document.getElementById('progressText'),
	scoreText: document.getElementById('scoreText'),
	progressFill: document.getElementById('progressFill'),
	timer: document.getElementById('timer'),
	timerText: document.getElementById('timerText'),
	timerFill: document.getElementById('timerFill'),
	questionMeta: document.getElementById('questionMeta'),
	questionText: document.getElementById('questionText'),
	answers: document.getElementById('answers'),
	typingArea: document.getElementById('typingArea'),
	typingMask: document.getElementById('typingMask'),
	typingInput: document.getElementById('typingInput'),
	hintBtn: document.getElementById('hintBtn'),
	submitBtn: document.getElementById('submitBtn'),
	feedback: document.getElementById('feedback'),
	nextBtn: document.getElementById('nextBtn'),
	quitBtn: document.getElementById('quitBtn'),

	resultText: document.getElementById('resultText'),
	backBtn: document.getElementById('backBtn'),
	restartBtn: document.getElementById('restartBtn'),
};

/** @type {{ groups: Record<string,{sections:string[], cases: Record<string,Record<string,string>>}> } | null} */
let studyData = null;

const state = {
	groupName: '',
	mode: 'choice',
	questions: [],
	index: 0,
	score: 0,
	target: null,
	locked: false,
	lastSelected: null,
	typedText: '',
	revealedHintIdx: new Set(),
	timePerQuestionSec: 20,
	timerId: null,
	timerEndsAtMs: 0,
	timerTotalMs: 0,
};

boot();

async function boot() {
	wireEvents();
	try {
		studyData = await loadStudyData('answers.json');
		initGroupSelect(studyData);
		els.dataStatus.textContent = 'ready';
	} catch (err) {
		showLoadError(err);
		els.dataStatus.textContent = 'error';
	}
}

function wireEvents() {
	els.groupSelect.addEventListener('change', () => {
		els.startBtn.disabled = !els.groupSelect.value;
	});

	els.timePerQuestion?.addEventListener('change', () => {
		// Keep the selected time as the new default for restarts
		state.timePerQuestionSec = Number(els.timePerQuestion.value) || 0;
	});

	els.modeSelect?.addEventListener('change', () => {
		state.mode = els.modeSelect.value || 'choice';
		syncCountControlForMode();
	});

	els.startBtn.addEventListener('click', () => {
		startQuiz();
	});

	els.nextBtn.addEventListener('click', () => {
		goNext();
	});

	els.quitBtn.addEventListener('click', () => {
		stopTimer();
		showScreen('group');
	});

	els.backBtn.addEventListener('click', () => {
		stopTimer();
		showScreen('group');
	});

	els.restartBtn.addEventListener('click', () => {
		if (!state.groupName) {
			showScreen('group');
			return;
		}
		startQuiz(state.groupName);
	});

	document.addEventListener('keydown', (e) => {
		if (els.screenQuiz.hidden) return;
		if (state.locked) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				if (!els.nextBtn.disabled) goNext();
			}
			return;
		}

		// Choice modes: allow 1-4 quick answers
		if (isChoiceMode(state.mode)) {
			const idx = keyToIndex(e.key);
			if (idx === null) return;
			e.preventDefault();
			selectChoice(idx);
			return;
		}

		// Typing mode: Enter submits (unless focus is elsewhere)
		if (state.mode === 'type' && e.key === 'Enter') {
			if (document.activeElement === els.typingInput) {
				e.preventDefault();
				submitTyping();
			}
		}
	});

	els.hintBtn?.addEventListener('click', () => {
		revealHint();
	});
	els.submitBtn?.addEventListener('click', () => {
		submitTyping();
	});

	els.typingInput?.addEventListener('input', () => {
		if (state.mode !== 'type') return;
		const q = state.questions[state.index];
		if (!q || state.locked) return;
		state.typedText = els.typingInput.value;
		renderTypingMask(q.answer, state.revealedHintIdx, state.typedText);
	});

	syncCountControlForMode();
}

function syncCountControlForMode() {
	if (!els.questionCount) return;
	const isTarget = state.mode === 'target';
	els.questionCount.disabled = isTarget;
	els.questionCount.title = isTarget ? 'Target practice ignores question count.' : '';
}

function isChoiceMode(mode) {
	return mode === 'choice' || mode === 'target';
}

function keyToIndex(key) {
	if (key === '1') return 0;
	if (key === '2') return 1;
	if (key === '3') return 2;
	if (key === '4') return 3;
	return null;
}

function initGroupSelect(data) {
	const groupNames = Object.keys(data.groups);
	els.groupSelect.innerHTML = '';
	for (const name of groupNames) {
		const opt = document.createElement('option');
		opt.value = name;
		opt.textContent = name;
		els.groupSelect.appendChild(opt);
	}

	els.groupSelect.disabled = false;
	els.startBtn.disabled = !els.groupSelect.value;
}

function showLoadError(err) {
	const msg = err instanceof Error ? err.message : String(err);
	els.loadError.hidden = false;
	els.loadError.textContent = `Couldn’t load answers.json. If you opened index.html directly, run a local server (recommended):\n\npython -m http.server 5173\n\nThen open http://localhost:5173\n\nError: ${msg}`;
	els.groupSelect.disabled = true;
	els.startBtn.disabled = true;
}

function startQuiz(forceGroupName) {
	if (!studyData) return;

	const groupName = forceGroupName || els.groupSelect.value;
	if (!groupName) return;

	const group = studyData.groups[groupName];
	const count = Number(els.questionCount.value) || 20;
	state.timePerQuestionSec = Number(els.timePerQuestion?.value) || 0;
	state.mode = els.modeSelect?.value || state.mode || 'choice';
	syncCountControlForMode();

	try {
		state.groupName = groupName;
		state.target = null;
		if (state.mode === 'target') {
			initTargetPractice({ group });
		} else {
			state.questions = buildQuestionsForMode({ mode: state.mode, group, count });
			state.index = 0;
		}
		state.score = 0;
		state.locked = false;
		state.lastSelected = null;
		state.typedText = '';
		state.revealedHintIdx = new Set();
		els.nextBtn.textContent = 'Next';
		stopTimer();
		syncTimerVisibility();
		showScreen('quiz');
		render();
	} catch (err) {
		showLoadError(err);
	}
}

function initTargetPractice({ group }) {
	const pairs = getChoiceQuestionPairs({ casesByName: group.cases, sections: group.sections });
	const viablePairs = [];
	for (const p of pairs) {
		try {
			// Validate that this pair can produce a 4-choice question
			makeChoiceQuestion({ casesByName: group.cases, itemName: p.itemName, section: p.section });
			viablePairs.push(p);
		} catch {
			// Skip pairs that can't form 4 unique options for this section
		}
	}
	if (viablePairs.length === 0) {
		throw new Error('No valid prompts found for Target practice in this group.');
	}

	state.target = {
		casesByName: group.cases,
		totalPairs: viablePairs.length,
		remainingPairs: viablePairs,
		streakByKey: new Map(),
	};

	state.questions = [];
	state.index = 0;
	state.questions.push(pickNextTargetQuestion());
}

function pickNextTargetQuestion() {
	if (!state.target) throw new Error('Target practice not initialized');
	const remaining = state.target.remainingPairs;
	if (remaining.length === 0) throw new Error('No remaining prompts');
	const p = remaining[Math.floor(Math.random() * remaining.length)];
	const q = makeChoiceQuestion({ casesByName: state.target.casesByName, itemName: p.itemName, section: p.section });
	return {
		...q,
		id: state.questions.length + 1,
		pairKey: targetPairKey(p),
	};
}

function targetPairKey(p) {
	return `${p.itemName}__${p.section}`;
}

function buildQuestionsForMode({ mode, group, count }) {
	if (mode === 'type') {
		return generateTypingQuestionSet({ itemsByName: group.cases, sections: group.sections, count });
	}
	return generateChoiceQuestionSet({ casesByName: group.cases, sections: group.sections, count });
}

function showScreen(which) {
	els.screenGroup.hidden = which !== 'group';
	els.screenQuiz.hidden = which !== 'quiz';
	els.screenDone.hidden = which !== 'done';

	if (which !== 'quiz') {
		stopTimer();
	}

	if (which === 'group') {
		els.feedback.textContent = '';
	}
}

function render() {
	const q = state.questions[state.index];
	if (!q) {
		finish();
		return;
	}

	state.locked = false;
	state.lastSelected = null;
	els.nextBtn.disabled = true;
	els.feedback.textContent = '';
	els.nextBtn.textContent = 'Next';

	if (state.mode === 'target' && state.target) {
		const totalPrompts = state.target.totalPairs;
		const remaining = state.target.remainingPairs.length;
		const mastered = totalPrompts - remaining;
		const asked = state.questions.length;

		els.progressText.textContent = `Mastered ${mastered}/${totalPrompts} • Q ${asked}`;
		els.scoreText.textContent = `Correct: ${state.score}/${asked}`;

		const pct = Math.round((mastered / Math.max(1, totalPrompts)) * 100);
		els.progressFill.style.width = `${pct}%`;
		els.progressFill.parentElement?.setAttribute('aria-valuenow', String(pct));
	} else {
		const total = state.questions.length;
		els.progressText.textContent = `Question ${state.index + 1}/${total}`;
		els.scoreText.textContent = `Score: ${state.score}`;

		const pct = Math.round(((state.index) / total) * 100);
		els.progressFill.style.width = `${pct}%`;
		els.progressFill.parentElement?.setAttribute('aria-valuenow', String(pct));
	}

	state.typedText = '';
	state.revealedHintIdx = new Set();

	if (state.mode === 'type') {
		renderTyping(q);
	} else {
		renderChoice(q);
	}

	startTimerForQuestion();
}

function renderChoice(q) {
	els.answers.hidden = false;
	els.typingArea.hidden = true;

	if (state.mode === 'target' && state.target) {
		const key = q.pairKey || targetPairKey({ itemName: q.itemName, section: q.section });
		const streak = state.target.streakByKey.get(key) || 0;
		els.questionMeta.textContent = `${q.itemName} • Streak ${streak}/2`;
		els.questionText.textContent = q.prompt;
	} else {
		els.questionMeta.textContent = q.itemName;
		els.questionText.textContent = q.prompt;
	}
	renderAnswers(q);
}

function renderTyping(q) {
	els.answers.hidden = true;
	els.typingArea.hidden = false;

	// For typing, make the section prominent and the clue the "question"
	els.questionMeta.textContent = q.section;
	els.questionText.textContent = q.clue;

	els.typingInput.value = '';
	state.typedText = '';
	els.typingInput.disabled = false;
	els.hintBtn.disabled = false;
	els.submitBtn.disabled = false;
	renderTypingMask(q.answer, state.revealedHintIdx, state.typedText);
	setTimeout(() => els.typingInput.focus(), 0);
}

function renderAnswers(question) {
	els.answers.innerHTML = '';
	const colors = ['c0', 'c1', 'c2', 'c3'];

	question.options.forEach((opt, i) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = `answer-btn ${colors[i % 4]}`;
		btn.dataset.index = String(i);
		btn.dataset.source = opt.sourceItemName || '';

		const text = document.createElement('div');
		text.className = 'answer-text';
		text.textContent = opt.text;
		btn.appendChild(text);

		const source = document.createElement('div');
		source.className = 'answer-source';
		source.textContent = opt.sourceItemName ? `— ${opt.sourceItemName}` : '';
		btn.appendChild(source);

		const len = opt.text.length;
		if (len > 160) btn.classList.add('is-very-long');
		else if (len > 110) btn.classList.add('is-long');

		btn.addEventListener('click', () => selectChoice(i));
		els.answers.appendChild(btn);
	});
}


function selectChoice(index) {
	const q = state.questions[state.index];
	if (!q || state.locked) return;
	lockAndRevealChoice({ selectedIndex: index, reason: 'answered' });
}

function goNext() {
	if (!state.locked) return;
	stopTimer();
	if (state.mode === 'target') {
		if (!state.target) {
			finish();
			return;
		}
		if (state.target.remainingPairs.length === 0) {
			finish();
			return;
		}
		state.index += 1;
		state.questions.push(pickNextTargetQuestion());
		render();
		return;
	}

	state.index += 1;
	if (state.index >= state.questions.length) {
		finish();
		return;
	}
	render();
}

function finish() {
	stopTimer();
	showScreen('done');
	if (state.mode === 'target' && state.target) {
		const totalPrompts = state.target.totalPairs;
		const asked = state.questions.length;
		const correct = state.score;
		const accuracy = asked > 0 ? Math.round((correct / asked) * 100) : 0;
		els.resultText.textContent = `Mastered all ${totalPrompts} prompts in ${asked} questions. Accuracy: ${accuracy}%.`;
	} else {
		const total = state.questions.length;
		els.resultText.textContent = `You got ${state.score} out of ${total} correct.`;
	}
	els.progressFill.style.width = `100%`;
}


function lockAndRevealChoice({ selectedIndex, reason }) {
	const q = state.questions[state.index];
	if (!q || state.locked) return;

	state.locked = true;
	state.lastSelected = selectedIndex;
	stopTimer();

	const answered = typeof selectedIndex === 'number';
	const correct = answered ? scoreChoiceSelection(q, selectedIndex) : false;
	if (correct) state.score += 1;

	let targetExtra = '';
	if (state.mode === 'target' && state.target) {
		const key = q.pairKey || targetPairKey({ itemName: q.itemName, section: q.section });
		const prev = state.target.streakByKey.get(key) || 0;
		const next = correct ? prev + 1 : 0;
		const clamped = Math.min(2, next);
		state.target.streakByKey.set(key, clamped);

		if (clamped >= 2) {
			const before = state.target.remainingPairs.length;
			state.target.remainingPairs = state.target.remainingPairs.filter((p) => targetPairKey(p) !== key);
			const removed = state.target.remainingPairs.length !== before;
			targetExtra = removed ? ' (Mastered — removed from pool)' : ' (Mastered)';
			if (state.target.remainingPairs.length === 0) {
				els.nextBtn.textContent = 'Finish';
			}
		} else if (correct) {
			targetExtra = ` (Streak ${clamped}/2)`;
		} else {
			targetExtra = ' (Streak reset to 0/2)';
		}
	}

	const buttons = [...els.answers.querySelectorAll('button.answer-btn')];
	for (const b of buttons) b.disabled = true;

	buttons.forEach((b) => {
		const i = Number(b.dataset.index);
		b.classList.add('show-source');
		if (i === q.correctIndex) b.classList.add('correct');
		else if (answered && i === selectedIndex) b.classList.add('wrong');
		if (typeof selectedIndex === 'number') {
			if (i !== selectedIndex) b.classList.add('dimmed');
			else b.classList.add(correct ? 'selected-correct' : 'selected-wrong');
		} else {
			// timeout: dim everything, highlight correct
			b.classList.add('dimmed');
		}
	});

	if (reason === 'timeout') els.feedback.textContent = `Time’s up. Correct answer highlighted.${state.mode === 'target' ? ' (Streak reset to 0/2)' : ''}`;
	else els.feedback.textContent = correct ? `Correct!${targetExtra}` : `Wrong. Correct answer highlighted.${targetExtra}`;

	els.nextBtn.disabled = false;

	if (state.mode === 'target' && state.target) {
		const totalPrompts = state.target.totalPairs;
		const remaining = state.target.remainingPairs.length;
		const mastered = totalPrompts - remaining;
		const asked = state.questions.length;

		const pct = Math.round((mastered / Math.max(1, totalPrompts)) * 100);
		els.progressFill.style.width = `${pct}%`;
		els.progressFill.parentElement?.setAttribute('aria-valuenow', String(pct));
		els.scoreText.textContent = `Correct: ${state.score}/${asked}`;
		els.progressText.textContent = `Mastered ${mastered}/${totalPrompts} • Q ${asked}`;
	} else {
		const total = state.questions.length;
		const pct = Math.round(((state.index + 1) / total) * 100);
		els.progressFill.style.width = `${pct}%`;
		els.progressFill.parentElement?.setAttribute('aria-valuenow', String(pct));
		els.scoreText.textContent = `Score: ${state.score}`;
	}
}

function lockAndRevealTyping({ typedText, reason }) {
	const q = state.questions[state.index];
	if (!q || state.locked) return;

	state.locked = true;
	stopTimer();

	const correct = reason !== 'timeout' && isTypingCorrect(q, typedText);
	if (correct) state.score += 1;

	els.typingInput.disabled = true;
	els.hintBtn.disabled = true;
	els.submitBtn.disabled = true;

	// Show full answer in the mask once locked
	const all = new Set();
	for (let i = 0; i < String(q.answer).length; i++) all.add(i);
	renderTypingMask(q.answer, all);

	if (reason === 'timeout') els.feedback.textContent = `Time’s up. Answer: ${q.answer}`;
	else els.feedback.textContent = correct ? 'Correct!' : `Wrong. Answer: ${q.answer}`;

	els.nextBtn.disabled = false;

	const total = state.questions.length;
	const pct = Math.round(((state.index + 1) / total) * 100);
	els.progressFill.style.width = `${pct}%`;
	els.progressFill.parentElement?.setAttribute('aria-valuenow', String(pct));
	els.scoreText.textContent = `Score: ${state.score}`;
}

function syncTimerVisibility() {
	if (!els.timer) return;
	els.timer.hidden = !(state.timePerQuestionSec > 0);
}

function startTimerForQuestion() {
	syncTimerVisibility();
	if (!(state.timePerQuestionSec > 0)) return;
	stopTimer();

	const totalMs = Math.max(1, Math.floor(state.timePerQuestionSec * 1000));
	state.timerTotalMs = totalMs;
	state.timerEndsAtMs = Date.now() + totalMs;

	updateTimerUI(totalMs);
	state.timerId = window.setInterval(() => tickTimer(), 80);
}

function tickTimer() {
	const remainingMs = Math.max(0, state.timerEndsAtMs - Date.now());
	updateTimerUI(remainingMs);

	if (remainingMs <= 0) {
		stopTimer();
		if (!state.locked && !els.screenQuiz.hidden) {
			if (state.mode === 'type') lockAndRevealTyping({ typedText: '', reason: 'timeout' });
			else lockAndRevealChoice({ selectedIndex: null, reason: 'timeout' });
		}
	}
}

function submitTyping() {
	if (state.mode !== 'type') return;
	const q = state.questions[state.index];
	if (!q || state.locked) return;
	lockAndRevealTyping({ typedText: els.typingInput.value, reason: 'answered' });
}

function revealHint() {
	if (state.mode !== 'type') return;
	const q = state.questions[state.index];
	if (!q || state.locked) return;

	const next = revealNextHintIndex(q.answer, state.revealedHintIdx);
	if (next === null) return;
	state.revealedHintIdx.add(next);
	renderTypingMask(q.answer, state.revealedHintIdx, state.typedText);
}


function renderTypingMask(answer, revealedSet, typedText) {
	const tokens = makeMaskTokens(answer, revealedSet);
	const typedChars = extractMaskableChars(typedText);
	let typedPos = 0;
	els.typingMask.innerHTML = '';
	for (const t of tokens) {
		const span = document.createElement('span');
		if (t.kind === 'space') {
			span.className = 'mask-char space';
			span.textContent = t.original;
		} else if (t.kind === 'punct') {
			span.className = 'mask-char punct';
			span.textContent = t.original;
		} else {
			const isHint = revealedSet.has(t.answerIndex);
			const isCurrent = !isHint && typedPos === typedChars.length;
			const hasTypedHere = !isHint && typedPos < typedChars.length;

			const classes = ['mask-char'];
			if (isHint) classes.push('revealed', 'underlined', 'hint');
			else if (hasTypedHere) classes.push('underlined');
			else if (isCurrent) classes.push('underlined', 'current');

			span.className = classes.join(' ');
			span.textContent = isHint ? t.original : hasTypedHere ? typedChars[typedPos] : '•';

			if (!isHint) typedPos += 1;
		}
		els.typingMask.appendChild(span);
	}
}

function extractMaskableChars(s) {
	return String(s || '').split('').filter((ch) => /[A-Za-z0-9]/.test(ch));
}

function stopTimer() {
	if (state.timerId !== null) {
		clearInterval(state.timerId);
		state.timerId = null;
	}
}

function updateTimerUI(remainingMs) {
	if (!els.timer || !els.timerText || !els.timerFill) return;
	const total = Math.max(1, state.timerTotalMs || 1);
	const pct = Math.max(0, Math.min(1, remainingMs / total));

	els.timerText.textContent = formatTime(remainingMs);
	els.timerFill.style.width = `${Math.round(pct * 100)}%`;

	els.timer.classList.toggle('is-low', pct <= 0.33);
	els.timer.classList.toggle('is-critical', pct <= 0.15);
}

function formatTime(ms) {
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
