const DATA_SOURCES = [
  { id: "hsk", label: "Tiếng Trung HSK1-2", file: "./data-hsk.json" },
  { id: "topic", label: "Ôn theo chủ đề", file: "./data-topic.json" }
];

function normalizeWordRecord(item, topic, id) {
  if (typeof item.word !== "string" || !item.word.trim()) {
    throw new TypeError(`Bản ghi ${id} thiếu từ vựng hợp lệ.`);
  }
  if (typeof item.type !== "string" || !item.type.trim()) {
    throw new TypeError(`Bản ghi ${id} thiếu loại từ hợp lệ.`);
  }
  if (typeof item.meaning !== "string" || !item.meaning.trim()) {
    throw new TypeError(`Bản ghi ${id} thiếu nghĩa tiếng Việt hợp lệ.`);
  }

  return {
    id,
    topic,
    word: item.word,
    type: item.type.toLowerCase(),
    phonetic: item.phonetic || "",
    meaning: item.meaning || "",
    example: item.example || "",
    examplePhonetic: item.examplePhonetic || "",
    exampleMeaning: item.exampleMeaning || "",
    answerChinese: item.answerChinese || "",
    answerPinyin: item.answerPinyin || "",
    answerMeaning: item.answerMeaning || ""
  };
}

function normalizeWordRecords(data) {
  const records = Array.isArray(data)
    ? data
    : data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.words)
      ? [data]
      : null;
  if (!records) {
    throw new TypeError("Dữ liệu từ vựng phải là một danh sách.");
  }

  return records.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(`Bản ghi từ vựng thứ ${index + 1} không hợp lệ.`);
    }

    const topic = item.topic || item.label || "General";
    if (Array.isArray(item.words)) {
      return item.words.map((wordItem, wordIndex) => {
        if (!wordItem || typeof wordItem !== "object" || Array.isArray(wordItem)) {
          throw new TypeError(`Từ thứ ${wordIndex + 1} trong chủ đề ${topic} không hợp lệ.`);
        }

        const id = `${topic}-${wordIndex}-${wordItem.word || "invalid"}`;
        return normalizeWordRecord(wordItem, topic, id);
      });
    }

    const id = item.id || `${topic}-${index}-${item.word}`;
    return [normalizeWordRecord(item, topic, id)];
  });
}

async function loadWords() {
  const loadedSources = await Promise.all(DATA_SOURCES.map(async source => {
    const response = await fetch(source.file);
    if (!response.ok) {
      throw new Error(`Không đọc được ${source.file} (HTTP ${response.status})`);
    }

    const records = normalizeWordRecords(await response.json());
    return records.map(record => ({
      ...record,
      sourceId: source.id
    }));
  }));

  return loadedSources.flat();
}

async function loadGrammarLessons() {
  const response = await fetch("./data-grammar.json");
  if (!response.ok) {
    throw new Error(`Không đọc được data-grammar.json (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Dữ liệu ngữ pháp phải được nhóm theo cấp độ.");
  }

  const lessons = Object.entries(data).flatMap(([level, topics]) => {
    if (!topics || typeof topics !== "object" || Array.isArray(topics)) {
      throw new TypeError(`Danh sách chủ đề ${level} không hợp lệ.`);
    }

    return Object.entries(topics).flatMap(([topic, topicLessons]) => {
      if (!Array.isArray(topicLessons)) {
        throw new TypeError(`Danh sách bài học ${topic} (${level}) không hợp lệ.`);
      }

      return topicLessons.map((lesson, index) => {
        if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)
          || typeof lesson.id !== "string" || !lesson.id.trim()
          || typeof lesson.title !== "string" || !lesson.title.trim()
          || !Number.isInteger(lesson.order) || lesson.order < 1
          || typeof lesson.structure !== "string"
          || typeof lesson.explanation !== "string"
          || !Array.isArray(lesson.examples) || !Array.isArray(lesson.practice)
          || lesson.practice.length === 0) {
          throw new TypeError(`Bài ${index + 1} trong chủ đề ${topic} (${level}) không hợp lệ.`);
        }

        lesson.examples.forEach((example, exampleIndex) => {
          if (!example || typeof example.chinese !== "string"
            || typeof example.pinyin !== "string" || typeof example.meaning !== "string") {
            throw new TypeError(`Ví dụ ${exampleIndex + 1} trong bài ${lesson.id} không hợp lệ.`);
          }
        });
        lesson.practice.forEach((practice, practiceIndex) => {
          if (!practice || typeof practice.vietnamese !== "string" || !practice.vietnamese.trim()
            || typeof practice.chinese !== "string" || !practice.chinese.trim()
            || typeof practice.pinyin !== "string") {
            throw new TypeError(`Câu luyện ${practiceIndex + 1} trong bài ${lesson.id} không hợp lệ.`);
          }
        });

        return { ...lesson, level, topic };
      });
    });
  });

  const lessonIds = new Set();
  lessons.forEach(lesson => {
    if (lessonIds.has(lesson.id)) {
      throw new TypeError(`Mã bài ngữ pháp bị trùng: ${lesson.id}`);
    }
    lessonIds.add(lesson.id);
  });

  return lessons.sort((first, second) => first.order - second.order);
}

function loadQuestionAnswers(words) {
  return words.flatMap((word, index) => {
    if (!word.answerChinese || !word.example) return [];

    return [{
      id: `${word.topic}-${index}-${word.word}`,
      wordId: word.id,
      topic: word.topic,
      targetWord: word.word,
      question: word.example,
      questionPinyin: word.examplePhonetic,
      questionMeaning: word.exampleMeaning,
      answerChinese: word.answerChinese,
      answerPinyin: word.answerPinyin,
      answerMeaning: word.answerMeaning
    }];
  });
}

let allWords = [];
let allQuestionAnswers = [];
let grammarLessons = [];
let currentGrammarPracticeIndex = 0;
let grammarPracticeQuestions = [];
let grammarPracticeMistakes = [];
let grammarPracticeCorrectIds = new Set();
let grammarPracticeIsRetryRound = false;
let grammarPracticeAnswered = false;

// Quiz State
let quizScore = 0;
let quizTotalQuestions = 0;
let currentQuizIndex = 0;
let quizQuestions = [];
let quizOptionPool = [];
let quizRoundMistakes = [];
let quizCorrectIds = new Set();
let quizIsRetryRound = false;
let currentQuizAnswered = false;
let quizShouldShuffle = false;
let quizPracticeMode = "word";

// DOM Elements - Common
const headerMenuToggle = document.getElementById("header-menu-toggle");
const headerActions = document.getElementById("header-actions");
const matchingModeBtn = document.getElementById("matching-mode-btn");
const quizModeBtn = document.getElementById("quiz-mode-btn");
const typingModeBtn = document.getElementById("typing-mode-btn");
const listeningModeBtn = document.getElementById("listening-mode-btn");
const questionAnswerModeBtn = document.getElementById("question-answer-mode-btn");
const readingModeBtn = document.getElementById("reading-mode-btn");
const matchingScreen = document.getElementById("matching-screen");
const quizScreen = document.getElementById("quiz-screen");
const listeningScreen = document.getElementById("listening-screen");
const questionAnswerScreen = document.getElementById("question-answer-screen");
const typingScreen = document.getElementById("typing-screen");
const readingScreen = document.getElementById("reading-screen");
const speakingModeBtn = document.getElementById("speaking-mode-btn");
const speakingScreen = document.getElementById("speaking-screen");
const grammarModeBtn = document.getElementById("grammar-mode-btn");
const grammarScreen = document.getElementById("grammar-screen");
const vocabularyStudyPanel = document.getElementById("vocabulary-study-panel");
const grammarLevelEl = document.getElementById("grammar-level");
const grammarTopicEl = document.getElementById("grammar-topic");
const grammarLessonEl = document.getElementById("grammar-lesson");
const grammarErrorEl = document.getElementById("grammar-error");
const grammarLessonContentEl = document.getElementById("grammar-lesson-content");
const grammarLessonMetaEl = document.getElementById("grammar-lesson-meta");
const grammarHeadingEl = document.getElementById("grammar-heading");
const grammarStructureEl = document.getElementById("grammar-structure");
const grammarExplanationEl = document.getElementById("grammar-explanation");
const grammarExamplesListEl = document.getElementById("grammar-examples-list");
const grammarStartPracticeBtn = document.getElementById("grammar-start-practice");
const grammarPracticeEl = document.getElementById("grammar-practice");
const grammarPracticeProgressEl = document.getElementById("grammar-practice-progress");
const grammarPracticeScoreEl = document.getElementById("grammar-practice-score");
const grammarPracticePromptEl = document.getElementById("grammar-practice-prompt");
const grammarAnswerEl = document.getElementById("grammar-answer");
const grammarPracticeFeedbackEl = document.getElementById("grammar-practice-feedback");
const grammarPracticeReferenceEl = document.getElementById("grammar-practice-reference");
const grammarReferenceAnswerEl = document.getElementById("grammar-reference-answer");
const grammarReferencePinyinEl = document.getElementById("grammar-reference-pinyin");
const grammarCheckAnswerBtn = document.getElementById("grammar-check-answer");
const grammarRevealAnswerBtn = document.getElementById("grammar-reveal-answer");
const grammarNextQuestionBtn = document.getElementById("grammar-next-question");
const grammarCompletionEl = document.getElementById("grammar-completion");
const grammarCompletionScoreEl = document.getElementById("grammar-completion-score");
const grammarRetryPracticeBtn = document.getElementById("grammar-retry-practice");
const grammarNextLessonBtn = document.getElementById("grammar-next-lesson");

const selectedWordCountEl = document.getElementById("selected-word-count");
const appLoadErrorEl = document.getElementById("app-load-error");
const btnShuffle = document.getElementById("btn-shuffle");
const studyModeEl = document.getElementById("study-mode");
const topicFilterEl = document.getElementById("topic-filter");
const topicFilterLabelEl = document.getElementById("topic-filter-label");
const topicFilterToggleEl = document.getElementById("topic-filter-toggle");
const topicFilterSelectionEl = document.getElementById("topic-filter-selection");
const topicFilterOptionsEl = document.getElementById("topic-filter-options");
const dataSourceEl = document.getElementById("data-source");

// DOM Elements - Matching
const matchingProgressEl = document.getElementById("matching-progress");
const matchingFeedbackEl = document.getElementById("matching-feedback");
const matchingChineseEl = document.getElementById("matching-chinese");
const matchingPinyinEl = document.getElementById("matching-pinyin");
const matchingVietnameseEl = document.getElementById("matching-vietnamese");
const matchingPinyinColumnEl = document.getElementById("matching-pinyin-column");
const matchingGridEl = document.getElementById("matching-grid");
const btnToggleMatchingPinyin = document.getElementById("btn-toggle-matching-pinyin");
const btnNextMatching = document.getElementById("btn-next-matching");

// DOM Elements - Quiz
const quizWordEl = document.getElementById("quiz-word");
const quizWordTypeEl = document.getElementById("quiz-word-type");
const quizPhoneticEl = document.getElementById("quiz-phonetic");
const quizExampleEl = document.getElementById("quiz-example");
const quizOptionsEl = document.getElementById("quiz-options");
const quizScoreEl = document.getElementById("quiz-score");
const quizProgressEl = document.getElementById("quiz-progress");
const btnNextQuiz = document.getElementById("btn-next-quiz");
const btnQuizSpeak = document.getElementById("btn-quiz-speak");
const quizPracticeModeEl = document.getElementById("quiz-practice-mode");
const quizPinyinVisibleEl = document.getElementById("quiz-pinyin-visible");
const quizExampleVisibleEl = document.getElementById("quiz-example-visible");
const quizExampleOptionEl = document.getElementById("quiz-example-option");
const quizAutoSpeakEl = document.getElementById("quiz-auto-speak");
const listeningScoreEl = document.getElementById("listening-score");
const listeningProgressEl = document.getElementById("listening-progress");
const listeningPromptEl = document.getElementById("listening-prompt");
const listeningOptionsEl = document.getElementById("listening-options");
const btnReplayListening = document.getElementById("btn-replay-listening");
const listeningContentModeEl = document.getElementById("listening-content-mode");
const listeningAnswerModeContainerEl = document.getElementById("listening-answer-mode-container");
const listeningAnswerModeEl = document.getElementById("listening-answer-mode");
const listeningInputLabelEl = document.getElementById("listening-input-label");
const listeningInputEl = document.getElementById("listening-input");
const btnCheckListening = document.getElementById("btn-check-listening");
const listeningFeedbackEl = document.getElementById("listening-feedback");
const questionAnswerScoreEl = document.getElementById("question-answer-score");
const questionAnswerProgressEl = document.getElementById("question-answer-progress");
const questionAnswerPromptEl = document.getElementById("question-answer-prompt");
const questionAnswerReviewEl = document.getElementById("question-answer-review");
const questionAnswerReviewLabelEl = document.getElementById("question-answer-review-label");
const questionAnswerQuestionTextEl = document.getElementById("question-answer-question-text");
const questionAnswerQuestionPinyinEl = document.getElementById("question-answer-question-pinyin");
const questionAnswerQuestionMeaningEl = document.getElementById("question-answer-question-meaning");
const questionAnswerAnswerMeaningEl = document.getElementById("question-answer-answer-meaning");
const questionAnswerModeEl = document.getElementById("question-answer-mode");
const btnToggleQuestionAnswerQuestion = document.getElementById("btn-toggle-question-answer-question");
const btnToggleQuestionAnswerPinyin = document.getElementById("btn-toggle-question-answer-pinyin");
const questionAnswerTypingAreaEl = document.getElementById("question-answer-typing-area");
const questionAnswerInputEl = document.getElementById("question-answer-input");
const btnCheckQuestionAnswer = document.getElementById("btn-check-question-answer");
const questionAnswerOptionsEl = document.getElementById("question-answer-options");
const questionAnswerFeedbackEl = document.getElementById("question-answer-feedback");
const btnReplayQuestionAnswer = document.getElementById("btn-replay-question-answer");
const btnNextQuestionAnswer = document.getElementById("btn-next-question-answer");
const typingScoreEl = document.getElementById("typing-score");
const typingProgressEl = document.getElementById("typing-progress");
const typingContentModeEl = document.getElementById("typing-content-mode");
const typingPromptEl = document.getElementById("typing-prompt");
const typingWordEl = document.getElementById("typing-word");
const typingPhoneticEl = document.getElementById("typing-phonetic");
const typingInputLabelEl = document.getElementById("typing-input-label");
const typingInputEl = document.getElementById("typing-input");
const typingPronunciationEnabledEl = document.getElementById("typing-pronunciation-enabled");
const btnCheckTyping = document.getElementById("btn-check-typing");
const typingFeedbackEl = document.getElementById("typing-feedback");
const readingScoreEl = document.getElementById("reading-score");
const readingProgressEl = document.getElementById("reading-progress");
const readingSentenceEl = document.getElementById("reading-sentence");
const readingPinyinEl = document.getElementById("reading-pinyin");
const btnToggleReadingPinyin = document.getElementById("btn-toggle-reading-pinyin");
const readingAnswerModeEl = document.getElementById("reading-answer-mode");
const readingInputEl = document.getElementById("reading-input");
const readingOptionsEl = document.getElementById("reading-options");
const readingPronunciationEnabledEl = document.getElementById("reading-pronunciation-enabled");
const btnCheckReading = document.getElementById("btn-check-reading");
const readingFeedbackEl = document.getElementById("reading-feedback");
const speakingProgressEl = document.getElementById("speaking-progress");
const speakingPromptEl = document.getElementById("speaking-prompt");
const speakingTargetEl = document.getElementById("speaking-target");
const speakingPhoneticEl = document.getElementById("speaking-phonetic");
const speakingAnswerEl = document.getElementById("speaking-answer");
const speakingSampleEl = document.getElementById("speaking-sample");
const speakingSamplePhoneticEl = document.getElementById("speaking-sample-phonetic");
const speakingStatusEl = document.getElementById("speaking-status");
const speakingPlaybackEl = document.getElementById("speaking-playback");
const btnRevealSpeakingAnswer = document.getElementById("btn-reveal-speaking-answer");
const btnSpeakSpeakingAnswer = document.getElementById("btn-speak-speaking-answer");
const btnStartSpeakingRecording = document.getElementById("btn-start-speaking-recording");
const btnStopSpeakingRecording = document.getElementById("btn-stop-speaking-recording");
const btnNextSpeaking = document.getElementById("btn-next-speaking");

let listeningQuestions = [];
let currentListeningIndex = 0;
let listeningScore = 0;
let listeningTotalQuestions = 0;
let listeningRoundMistakes = [];
let listeningCorrectIds = new Set();
let listeningIsRetryRound = false;
let listeningAnswered = false;
let listeningShouldShuffle = false;
let questionAnswerQuestions = [];
let currentQuestionAnswerIndex = 0;
let questionAnswerScore = 0;
let questionAnswerTotalQuestions = 0;
let questionAnswerRoundMistakes = [];
let questionAnswerCorrectIds = new Set();
let questionAnswerIsRetryRound = false;
let questionAnswerAnswered = false;
let questionAnswerShouldShuffle = false;

// --- LOGIC MATCHING ---
const MATCHING_SIZE = 6;
let matchingWords = [];
let matchingSelections = {};
let matchingCorrectIds = new Set();
let matchingIsLocked = false;
let matchingResetTimeout = null;
let matchingPinyinVisible = true;
let questionAnswerPinyinVisible = true;
let questionAnswerQuestionVisible = false;
let readingPinyinVisible = false;

function shuffleList(list) {
  const shuffled = [...list];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeChineseAnswer(value) {
  return value.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");
}

function renderRestartButton(container, label, onClick) {
  const button = document.createElement("button");
  button.className = "btn btn-primary btn-full";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  container.replaceChildren(button);
}

function startMatching() {
  clearTimeout(matchingResetTimeout);
  matchingIsLocked = false;
  const filteredWords = getFilteredWords();
  matchingWords = [];
  const usedValues = {
    word: new Set(),
    phonetic: new Set(),
    meaning: new Set()
  };

  for (const word of shuffleList(filteredWords)) {
    const values = [word.word, word.phonetic, word.meaning];
    const fields = ["word", "phonetic", "meaning"];
    if (fields.some((field, index) => usedValues[field].has(values[index]))) continue;

    matchingWords.push(word);
    fields.forEach((field, index) => usedValues[field].add(values[index]));
    if (matchingWords.length === MATCHING_SIZE) break;
  }

  matchingSelections = {};
  matchingCorrectIds = new Set();
  renderMatchingBoard();
}

function renderMatchingBoard() {
  const columns = [
    [matchingChineseEl, "word"],
    [matchingPinyinEl, "phonetic"],
    [matchingVietnameseEl, "meaning"]
  ];

  matchingProgressEl.textContent = `${matchingCorrectIds.size} / ${matchingWords.length} bộ đúng`;
  matchingFeedbackEl.textContent = matchingWords.length
    ? (matchingPinyinVisible ? "Chọn một ô ở mỗi cột" : "Chọn một ô ở mỗi cột đang hiện")
    : "Không có từ phù hợp";
  matchingPinyinColumnEl.classList.toggle("hidden", !matchingPinyinVisible);
  matchingGridEl.classList.toggle("matching-grid-without-pinyin", !matchingPinyinVisible);
  btnToggleMatchingPinyin.textContent = matchingPinyinVisible ? "Ẩn pinyin" : "Hiện pinyin";
  btnNextMatching.classList.toggle("hidden", matchingWords.length === 0 || matchingCorrectIds.size !== matchingWords.length);

  columns.forEach(([container, field]) => {
    container.replaceChildren();
    shuffleList(matchingWords).forEach(word => {
      const button = document.createElement("button");
      button.className = `matching-option${field === "word" ? " matching-option-chinese" : ""}`;
      button.dataset.id = word.id;
      button.textContent = word[field];
      button.disabled = matchingCorrectIds.has(word.id);
      button.addEventListener("click", () => selectMatchingOption(field, word.id, button));
      container.appendChild(button);
    });
  });
}

function selectMatchingOption(field, id, button) {
  if (matchingIsLocked) return;

  matchingSelections[field] = id;
  button.parentElement.querySelectorAll(".matching-option").forEach(option => option.classList.remove("selected"));
  button.classList.add("selected");

  const requiredFields = matchingPinyinVisible
    ? ["word", "phonetic", "meaning"]
    : ["word", "meaning"];
  if (requiredFields.some(requiredField => !matchingSelections[requiredField])) return;

  const selectedIds = requiredFields.map(requiredField => matchingSelections[requiredField]);
  if (new Set(selectedIds).size === 1) {
    matchingCorrectIds.add(id);
    matchingFeedbackEl.textContent = "Đúng rồi! Chọn bộ tiếp theo.";
    matchingSelections = {};
    renderMatchingBoard();
    return;
  }

  matchingFeedbackEl.textContent = "Chưa đúng, hãy thử lại.";
  const selectedOptions = matchingScreen.querySelectorAll(".matching-option.selected");
  selectedOptions.forEach(option => option.classList.add("wrong"));
  matchingSelections = {};
  matchingIsLocked = true;
  matchingResetTimeout = setTimeout(() => {
    selectedOptions.forEach(option => option.classList.remove("selected", "wrong"));
    matchingIsLocked = false;
    matchingResetTimeout = null;
  }, 450);
}

btnNextMatching.addEventListener("click", startMatching);
btnToggleMatchingPinyin.addEventListener("click", () => {
  matchingPinyinVisible = !matchingPinyinVisible;
  btnToggleMatchingPinyin.textContent = matchingPinyinVisible ? "Ẩn cột pinyin" : "Hiện cột pinyin";
  btnToggleMatchingPinyin.setAttribute("aria-expanded", String(matchingPinyinVisible));
  matchingSelections = {};
  renderMatchingBoard();
});

// --- FILTERS & QUIZ ---
const STUDY_TYPE_FILTERS = {
  noun: ["noun"],
  verb: ["verb"],
  adjective: ["adjective"],
  phrase: ["phrase", "expression"],
  number: ["number", "numeral"],
  pronoun: ["pronoun"],
  adverb: ["adverb"],
  particle: ["particle"],
  "measure-word": ["measure word"],
  conjunction: ["conjunction"],
  interjection: ["interjection"],
  prefix: ["prefix"],
  suffix: ["suffix"]
};

function getAvailableWords() {
  const selectedSource = dataSourceEl.value;
  return selectedSource === "all"
    ? allWords
    : allWords.filter(word => word.sourceId === selectedSource);
}

function getFilteredWords() {
  const mode = studyModeEl.value;
  const availableWords = getAvailableWords();

  if (mode === "topic") {
    const selectedTopics = getSelectedTopics();
    return selectedTopics === null
      ? [...availableWords]
      : availableWords.filter(word => selectedTopics.has(word.topic));
  }

  if (STUDY_TYPE_FILTERS[mode]) {
    const matchingTypes = getMatchingTypes(mode);
    return availableWords.filter(word =>
      word.type.toLowerCase().split(/\s*\/\s*/).some(type => matchingTypes.includes(type))
    );
  }

  return [...availableWords];
}

function getMatchingTypes(mode) {
  return STUDY_TYPE_FILTERS[mode] || [mode];
}

function updateStudyModeAvailability() {
  const availableWords = getAvailableWords();
  const categoryModes = Object.keys(STUDY_TYPE_FILTERS);

  [...studyModeEl.options].forEach(option => {
    if (!categoryModes.includes(option.value)) return;

    const matchingTypes = getMatchingTypes(option.value);
    option.disabled = !availableWords.some(word =>
      word.type.split(/\s*\/\s*/).some(type => matchingTypes.includes(type))
    );
  });

  if (studyModeEl.selectedOptions[0]?.disabled) {
    studyModeEl.value = "all";
  }
}

function updateSelectedWordCount() {
  selectedWordCountEl.textContent = getFilteredWords().length;
}

function startQuiz(shouldShuffle = false) {
  const filteredWords = getFilteredWords();

  if (filteredWords.length < 4) {
    alert("Cần ít nhất 4 từ vựng trong bộ lọc hiện tại để bắt đầu làm Quiz!");
    return;
  }

  quizOptionPool = [...filteredWords];
  quizShouldShuffle = shouldShuffle;
  quizQuestions = shouldShuffle ? shuffleList(filteredWords) : [...filteredWords];
  quizTotalQuestions = filteredWords.length;
  quizRoundMistakes = [];
  quizCorrectIds = new Set();
  quizIsRetryRound = false;
  currentQuizIndex = 0;
  quizScore = 0;
  quizScoreEl.textContent = quizScore;
  btnNextQuiz.classList.remove("hidden");
  loadQuizQuestion();
}

function shuffleWords() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length === 0) {
    alert("Không có từ vựng nào trong bộ lọc hiện tại để xáo trộn!");
    return;
  }
  updateSelectedWordCount();

  if (currentMode === "matching") {
    startMatching();
  } else if (currentMode === "quiz") {
    startQuiz(true);
  } else if (currentMode === "listening") {
    startListeningPractice(true);
  } else if (currentMode === "question-answer") {
    startQuestionAnswerPractice(true);
  } else if (currentMode === "reading") {
    startReadingPractice(true);
  } else if (currentMode === "speaking") {
    startSpeakingPractice(true);
  } else {
    startTypingPractice(true);
  }
}

function getQuizAnswerText(word) {
  return quizPracticeMode === "example"
    ? (word.exampleMeaning || word.meaning)
    : word.meaning;
}

function updateQuizHints() {
  quizPhoneticEl.classList.toggle("hidden", !quizPinyinVisibleEl.checked);
  quizExampleEl.querySelectorAll(".example-pinyin").forEach(pinyin => {
    pinyin.classList.toggle("hidden", !quizPinyinVisibleEl.checked);
  });
  quizExampleEl.classList.toggle(
    "quiz-example-hidden",
    quizPracticeMode === "example" || !quizExampleVisibleEl.checked
  );
  quizExampleOptionEl.classList.toggle("hidden", quizPracticeMode === "example");
}

function loadQuizQuestion() {
  if (currentQuizIndex >= quizQuestions.length) {
    if (quizRoundMistakes.length > 0) {
      quizQuestions = quizShouldShuffle ? shuffleList(quizRoundMistakes) : [...quizRoundMistakes];
      quizRoundMistakes = [];
      quizIsRetryRound = true;
      currentQuizIndex = 0;
    } else {
      quizWordEl.textContent = "Hoàn thành!";
      quizWordTypeEl.textContent = `Bạn đã đúng hết ${quizCorrectIds.size} câu.`;
      quizPhoneticEl.textContent = "";
      quizExampleEl.textContent = "";
      quizProgressEl.textContent = "Đã hoàn thành";
      renderRestartButton(quizOptionsEl, "Làm lại Quiz", () => startQuiz());
      btnNextQuiz.classList.add("hidden");
      return;
    }
  }

  const currentQ = quizQuestions[currentQuizIndex];
  const isExamplePractice = quizPracticeMode === "example";
  currentQuizAnswered = false;
  quizWordEl.textContent = isExamplePractice ? currentQ.example : currentQ.word;
  quizWordTypeEl.textContent = isExamplePractice ? "Câu ví dụ" : formatWordType(currentQ.type);
  quizPhoneticEl.textContent = isExamplePractice
    ? (currentQ.examplePhonetic || "")
    : (currentQ.phonetic || "");
  quizExampleEl.replaceChildren();
  if (!isExamplePractice && currentQ.example) {
    quizExampleEl.append(`Ví dụ: "${currentQ.example}"`);
    if (currentQ.examplePhonetic) {
      const lineBreak = document.createElement("br");
      const examplePinyin = document.createElement("span");
      examplePinyin.className = "example-pinyin";
      examplePinyin.textContent = currentQ.examplePhonetic;
      quizExampleEl.append(lineBreak, examplePinyin);
    }
  }
  updateQuizHints();
  quizProgressEl.textContent = quizIsRetryRound
    ? `Còn sai: ${quizTotalQuestions - quizCorrectIds.size} câu`
    : `Câu ${currentQuizIndex + 1} / ${quizQuestions.length}`;

  const correctAnswerKey = normalizeAnswer(getQuizAnswerText(currentQ));
  const seenAnswerKeys = new Set([correctAnswerKey]);
  const wrongOptions = shuffleList(quizOptionPool.filter(word => word.id !== currentQ.id))
    .filter(word => {
      const answerKey = normalizeAnswer(getQuizAnswerText(word));
      if (seenAnswerKeys.has(answerKey)) return false;
      seenAnswerKeys.add(answerKey);
      return true;
    })
    .slice(0, 3);
  const options = shuffleList([...wrongOptions, currentQ]);

  // Render các nút đáp án
  quizOptionsEl.replaceChildren();
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "quiz-option-btn";
    btn.textContent = getQuizAnswerText(opt);
    btn.onclick = () => selectQuizAnswer(opt.id, currentQ.id, btn);
    quizOptionsEl.appendChild(btn);
  });

  if (quizAutoSpeakEl.checked) {
    speakChinese(isExamplePractice ? currentQ.example : currentQ.word, 2);
  }
}

function formatWordType(type) {
  const labels = {
    adjective: "Tính từ",
    "auxiliary verb": "Trợ động từ",
    adverb: "Phó từ",
    conjunction: "Liên từ",
    expression: "Cụm từ",
    interjection: "Thán từ",
    "measure word": "Lượng từ",
    noun: "Danh từ",
    number: "Số từ",
    numeral: "Số từ",
    particle: "Trợ từ",
    phrase: "Cụm từ",
    prefix: "Tiền tố",
    pronoun: "Đại từ",
    suffix: "Hậu tố",
    verb: "Động từ",
    vocabulary: "Từ vựng"
  };

  return type.split(/\s*\/\s*/).map(item => labels[item] || item).join(" / ");
}

function updateQuizRetryCount() {
  if (!quizIsRetryRound) return;

  const remainingQuestions = quizTotalQuestions - quizCorrectIds.size;
  quizProgressEl.textContent = `Còn sai: ${remainingQuestions} câu`;
}

function selectQuizAnswer(selectedId, correctId, selectedBtn) {
  if (currentQuizAnswered) return;

  currentQuizAnswered = true;

  // Khóa tất cả các nút sau khi đã chọn
  const allBtns = quizOptionsEl.querySelectorAll(".quiz-option-btn");
  allBtns.forEach(btn => btn.disabled = true);

  if (selectedId === correctId) {
    selectedBtn.classList.add("correct");
    quizCorrectIds.add(correctId);
    quizScore = quizCorrectIds.size;
    quizScoreEl.textContent = quizScore;
  } else {
    selectedBtn.classList.add("wrong");
    if (!quizRoundMistakes.some(word => word.id === correctId)) {
      const missedWord = quizOptionPool.find(word => word.id === correctId);
      if (missedWord) quizRoundMistakes.push(missedWord);
    }
    const correctOption = quizOptionPool.find(word => word.id === correctId);
    const correctText = correctOption && getQuizAnswerText(correctOption);
    allBtns.forEach(btn => {
      if (correctOption && btn.textContent === correctText) {
        btn.classList.add("correct");
      }
    });
  }

  updateQuizRetryCount();

  btnNextQuiz.classList.remove("hidden");
}

btnNextQuiz.addEventListener("click", () => {
  if (!currentQuizAnswered) {
    const skippedWord = quizQuestions[currentQuizIndex];
    if (skippedWord && !quizRoundMistakes.some(word => word.id === skippedWord.id)) {
      quizRoundMistakes.push(skippedWord);
    }
  }

  currentQuizIndex++;
  loadQuizQuestion();
});

btnQuizSpeak.addEventListener("click", () => {
  if (!quizQuestions[currentQuizIndex]) return;
  const currentWord = quizQuestions[currentQuizIndex];
  speakChinese(quizPracticeMode === "example" ? currentWord.example : currentWord.word);
});

quizPracticeModeEl.addEventListener("change", () => {
  quizPracticeMode = quizPracticeModeEl.value;
  startQuiz();
});
quizPinyinVisibleEl.addEventListener("change", updateQuizHints);
quizExampleVisibleEl.addEventListener("change", updateQuizHints);

const MALE_MANDARIN_VOICE_HINTS = ["yunxi", "yunyang", "yunfeng", "kangkang"];

function getMandarinVoice() {
  const voices = window.speechSynthesis.getVoices();
  const mandarinVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith("zh"));
  const chineseVoices = mandarinVoices.filter(voice =>
    voice.lang.toLowerCase() === "zh-cn"
  );

  return chineseVoices.find(voice => {
    const voiceName = voice.name.toLowerCase();
    return MALE_MANDARIN_VOICE_HINTS.some(hint => voiceName.includes(hint));
  }) || chineseVoices[0] || mandarinVoices[0];
}

function speakChinese(text, repeatCount = 1) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  for (let i = 0; i < repeatCount; i++) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = repeatCount > 1 ? 0.9 : 0.8;
    const chineseVoice = getMandarinVoice();
    if (chineseVoice) utterance.voice = chineseVoice;
    window.speechSynthesis.speak(utterance);
  }
}

function formatChineseAnswer(chineseText, phoneticText) {
  return `${chineseText}${phoneticText ? ` (${phoneticText})` : ""}`;
}

function setFeedback(element, message, isCorrect) {
  element.textContent = message;
  element.classList.toggle("is-correct", isCorrect === true);
  element.classList.toggle("is-wrong", isCorrect === false);
}

function startListeningPractice(shouldShuffle = false) {
  const filteredWords = getFilteredWords();
  if (filteredWords.length < 4) {
    alert("Cần ít nhất 4 từ vựng trong bộ lọc hiện tại để bắt đầu luyện nghe!");
    return;
  }

  listeningShouldShuffle = shouldShuffle;
  listeningQuestions = shouldShuffle ? shuffleList(filteredWords) : [...filteredWords];
  currentListeningIndex = 0;
  listeningScore = 0;
  listeningTotalQuestions = filteredWords.length;
  listeningRoundMistakes = [];
  listeningCorrectIds = new Set();
  listeningIsRetryRound = false;
  listeningScoreEl.textContent = listeningScore;
  loadListeningQuestion();
}

function loadListeningQuestion() {
  if (currentListeningIndex >= listeningQuestions.length) {
    if (listeningRoundMistakes.length > 0) {
      listeningQuestions = listeningShouldShuffle ? shuffleList(listeningRoundMistakes) : [...listeningRoundMistakes];
      listeningRoundMistakes = [];
      listeningIsRetryRound = true;
      currentListeningIndex = 0;
    } else {
      listeningProgressEl.textContent = "Đã hoàn thành";
      listeningOptionsEl.classList.remove("hidden");
      renderRestartButton(listeningOptionsEl, "Làm lại luyện nghe", () => startListeningPractice());
      listeningAnswerModeContainerEl.classList.add("hidden");
      listeningInputLabelEl.classList.add("hidden");
      listeningInputEl.classList.add("hidden");
      btnCheckListening.classList.add("hidden");
      return;
    }
  }

  const currentWord = listeningQuestions[currentListeningIndex];
  listeningAnswered = false;
  listeningProgressEl.textContent = listeningIsRetryRound
    ? `Còn sai: ${listeningTotalQuestions - listeningCorrectIds.size} câu`
    : `Câu ${currentListeningIndex + 1} / ${listeningQuestions.length}`;
  listeningOptionsEl.replaceChildren();
  setFeedback(listeningFeedbackEl, "");

  const isExampleMode = listeningContentModeEl.value === "example";
  const isVietnameseAnswer = !isExampleMode && listeningAnswerModeEl.value === "vietnamese";
  listeningPromptEl.textContent = isExampleMode
    ? "Nghe câu ví dụ tiếng Trung rồi gõ lại bằng chữ Hán"
    : isVietnameseAnswer
      ? "Nghe từ tiếng Trung rồi nhập nghĩa tiếng Việt"
      : "Nghe từ tiếng Trung rồi gõ chữ Hán";
  listeningOptionsEl.classList.add("hidden");
  listeningAnswerModeContainerEl.classList.toggle("hidden", isExampleMode);
  listeningInputLabelEl.textContent = isVietnameseAnswer
    ? "Nhập nghĩa tiếng Việt của từ vừa nghe"
    : isExampleMode
      ? "Gõ chữ Hán của câu ví dụ vừa nghe"
      : "Gõ chữ Hán vừa nghe";
  listeningInputLabelEl.classList.remove("hidden");
  listeningInputEl.classList.remove("hidden");
  btnCheckListening.classList.remove("hidden");
  listeningInputEl.placeholder = isVietnameseAnswer
    ? "Nhập nghĩa tiếng Việt..."
    : isExampleMode
      ? "Nhập câu ví dụ bằng chữ Hán..."
      : "Nhập chữ Hán...";
  listeningInputEl.lang = isVietnameseAnswer ? "vi" : "zh";
  listeningInputEl.value = "";
  listeningInputEl.disabled = false;
  btnCheckListening.disabled = false;
  btnCheckListening.textContent = "Kiểm tra";
  listeningInputEl.focus();

  speakChinese(isExampleMode ? currentWord.example : currentWord.word);
}

function updateListeningRetryCount() {
  if (!listeningIsRetryRound) return;

  const remainingQuestions = listeningTotalQuestions - listeningCorrectIds.size;
  listeningProgressEl.textContent = `Còn sai: ${remainingQuestions} câu`;
}

btnCheckListening.addEventListener("click", () => {
  if (listeningAnswered) {
    advanceListeningQuestion();
    return;
  }

  const currentWord = listeningQuestions[currentListeningIndex];
  if (!currentWord) return;

  const isExampleMode = listeningContentModeEl.value === "example";
  const isVietnameseAnswer = !isExampleMode && listeningAnswerModeEl.value === "vietnamese";
  const expectedAnswer = isVietnameseAnswer
    ? currentWord.meaning
    : isExampleMode
      ? currentWord.example
      : currentWord.word;
  const correctValues = isVietnameseAnswer
    ? [expectedAnswer, ...expectedAnswer.split(/[,，;；/]/)].map(normalizeAnswer).filter(Boolean)
    : expectedAnswer.split(",").map(normalizeChineseAnswer);
  const inputValue = isVietnameseAnswer
    ? normalizeAnswer(listeningInputEl.value)
    : normalizeChineseAnswer(listeningInputEl.value);
  const isCorrect = correctValues.includes(inputValue);
  const correctChinese = isExampleMode ? currentWord.example : currentWord.word;
  const correctPinyin = isExampleMode ? currentWord.examplePhonetic : currentWord.phonetic;
  const correctMeaning = isExampleMode ? currentWord.exampleMeaning : currentWord.meaning;

  if (isCorrect) {
    listeningCorrectIds.add(currentWord.id);
    listeningScore = listeningCorrectIds.size;
    listeningScoreEl.textContent = listeningScore;
    const feedback = isVietnameseAnswer
      ? `✅ Đúng! Chữ Hán: ${formatChineseAnswer(correctChinese, correctPinyin)}`
      : `✅ Đúng! Nghĩa tiếng Việt: ${correctMeaning}`;
    setFeedback(listeningFeedbackEl, feedback, true);
  } else {
    if (!listeningRoundMistakes.some(word => word.id === currentWord.id)) {
      listeningRoundMistakes.push(currentWord);
    }
    setFeedback(
      listeningFeedbackEl,
      `❌ Sai. Đáp án đúng là: ${correctChinese} - ${correctMeaning}`,
      false
    );
  }

  listeningAnswered = true;
  listeningInputEl.disabled = true;
  btnCheckListening.disabled = false;
  btnCheckListening.textContent = "Câu tiếp theo ➡";
  updateListeningRetryCount();
});

btnReplayListening.addEventListener("click", () => {
  const currentWord = listeningQuestions[currentListeningIndex];
  if (!currentWord) return;

  const isExampleMode = listeningContentModeEl.value === "example";
  speakChinese(isExampleMode ? currentWord.example : currentWord.word);
});

function advanceListeningQuestion() {
  if (!listeningAnswered) {
    const skippedWord = listeningQuestions[currentListeningIndex];
    if (skippedWord && !listeningRoundMistakes.some(word => word.id === skippedWord.id)) {
      listeningRoundMistakes.push(skippedWord);
    }
  }

  currentListeningIndex++;
  loadListeningQuestion();
}

listeningContentModeEl.addEventListener("change", () => {
  loadListeningQuestion();
});
listeningAnswerModeEl.addEventListener("change", () => {
  loadListeningQuestion();
});

function getFilteredQuestionAnswers() {
  const allowedWordIds = new Set(getFilteredWords().map(word => word.id));
  return allQuestionAnswers.filter(question => allowedWordIds.has(question.wordId));
}

function startQuestionAnswerPractice(shouldShuffle = false, showAlert = true) {
  const filteredQuestions = getFilteredQuestionAnswers();
  if (filteredQuestions.length < 4) {
    if (showAlert) {
      alert("Cần ít nhất 4 cặp hỏi đáp trong bộ lọc hiện tại để bắt đầu luyện hỏi đáp!");
    } else {
      questionAnswerProgressEl.textContent = "Chưa đủ câu hỏi";
      questionAnswerPromptEl.textContent = "Chọn chủ đề có ít nhất 4 cặp hỏi đáp để tiếp tục.";
      questionAnswerOptionsEl.replaceChildren();
      questionAnswerOptionsEl.classList.remove("hidden");
      questionAnswerTypingAreaEl.classList.add("hidden");
      btnToggleQuestionAnswerQuestion.classList.add("hidden");
      btnToggleQuestionAnswerPinyin.classList.add("hidden");
      questionAnswerReviewEl.classList.add("hidden");
      btnNextQuestionAnswer.classList.add("hidden");
      questionAnswerInputEl.disabled = true;
      btnCheckQuestionAnswer.disabled = true;
    }
    return;
  }

  questionAnswerShouldShuffle = shouldShuffle;
  questionAnswerQuestions = shouldShuffle ? shuffleList(filteredQuestions) : [...filteredQuestions];
  currentQuestionAnswerIndex = 0;
  questionAnswerScore = 0;
  questionAnswerTotalQuestions = filteredQuestions.length;
  questionAnswerRoundMistakes = [];
  questionAnswerCorrectIds = new Set();
  questionAnswerIsRetryRound = false;
  questionAnswerAnswered = false;
  questionAnswerScoreEl.textContent = questionAnswerScore;
  loadQuestionAnswer();
}

function loadQuestionAnswer() {
  if (currentQuestionAnswerIndex >= questionAnswerQuestions.length) {
    if (questionAnswerRoundMistakes.length > 0) {
      questionAnswerQuestions = questionAnswerShouldShuffle
        ? shuffleList(questionAnswerRoundMistakes)
        : [...questionAnswerRoundMistakes];
      questionAnswerRoundMistakes = [];
      questionAnswerIsRetryRound = true;
      currentQuestionAnswerIndex = 0;
    } else {
      questionAnswerProgressEl.textContent = "Đã hoàn thành";
      questionAnswerPromptEl.textContent = "Bạn đã hoàn thành lượt hỏi đáp!";
      questionAnswerTypingAreaEl.classList.add("hidden");
      questionAnswerOptionsEl.classList.remove("hidden");
      btnToggleQuestionAnswerQuestion.classList.add("hidden");
      btnToggleQuestionAnswerPinyin.classList.add("hidden");
      renderRestartButton(questionAnswerOptionsEl, "Làm lại hỏi đáp", () => startQuestionAnswerPractice());
      btnNextQuestionAnswer.classList.add("hidden");
      return;
    }
  }

  const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
  const isTypingAnswer = questionAnswerModeEl.value === "chinese";
  const isChineseChoice = questionAnswerModeEl.value === "chinese-choice";
  questionAnswerAnswered = false;
  questionAnswerProgressEl.textContent = questionAnswerIsRetryRound
    ? `Còn sai: ${questionAnswerTotalQuestions - questionAnswerCorrectIds.size} câu`
    : `Câu ${currentQuestionAnswerIndex + 1} / ${questionAnswerQuestions.length}`;
  questionAnswerPromptEl.textContent = isTypingAnswer
    ? "Nghe câu hỏi tiếng Trung rồi gõ câu trả lời bằng tiếng Trung"
    : isChineseChoice
      ? "Nghe câu hỏi tiếng Trung rồi chọn câu trả lời bằng tiếng Trung"
      : "Nghe câu hỏi tiếng Trung rồi chọn nghĩa tiếng Việt của câu trả lời";
  questionAnswerOptionsEl.replaceChildren();
  questionAnswerTypingAreaEl.classList.toggle("hidden", !isTypingAnswer);
  questionAnswerOptionsEl.classList.toggle("hidden", isTypingAnswer);
  questionAnswerQuestionVisible = false;
  btnToggleQuestionAnswerQuestion.classList.toggle("hidden", !isTypingAnswer);
  btnToggleQuestionAnswerQuestion.textContent = isTypingAnswer
    ? "Hiển thị nghĩa tiếng Việt của câu trả lời"
    : "Hiển thị câu hỏi";
  btnToggleQuestionAnswerQuestion.setAttribute("aria-expanded", "false");
  btnToggleQuestionAnswerPinyin.classList.toggle("hidden", !isChineseChoice);
  btnToggleQuestionAnswerPinyin.textContent = questionAnswerPinyinVisible ? "Ẩn pinyin" : "Hiện pinyin";
  btnToggleQuestionAnswerPinyin.setAttribute("aria-pressed", String(questionAnswerPinyinVisible));
  btnNextQuestionAnswer.classList.add("hidden");
  questionAnswerReviewEl.classList.add("hidden");
  questionAnswerQuestionTextEl.textContent = "";
  questionAnswerQuestionPinyinEl.textContent = "";
  questionAnswerQuestionPinyinEl.classList.toggle("hidden", !questionAnswerPinyinVisible);
  questionAnswerQuestionMeaningEl.textContent = "";
  questionAnswerQuestionMeaningEl.classList.add("hidden");
  questionAnswerReviewLabelEl.textContent = "Câu hỏi";
  questionAnswerAnswerMeaningEl.textContent = "";
  questionAnswerAnswerMeaningEl.classList.add("hidden");
  setFeedback(questionAnswerFeedbackEl, "");

  if (isTypingAnswer) {
    questionAnswerInputEl.value = "";
    questionAnswerInputEl.disabled = false;
    btnCheckQuestionAnswer.disabled = false;
    btnCheckQuestionAnswer.textContent = "Kiểm tra";
    questionAnswerInputEl.focus();
  } else {
    const answerField = isChineseChoice ? "answerChinese" : "answerMeaning";
    const correctAnswer = currentQuestion[answerField];
    const distractors = [...new Map(getFilteredQuestionAnswers()
      .filter(question => question.id !== currentQuestion.id)
      .filter(question => question[answerField] && question[answerField] !== correctAnswer)
      .map(question => [question[answerField], question])).values()];
    const options = shuffleList([
      ...shuffleList(distractors).slice(0, 3),
      currentQuestion
    ]);
    options.forEach(option => {
      const answer = option[answerField];
      const button = document.createElement("button");
      button.className = "quiz-option-btn";
      button.dataset.answer = answer;
      if (isChineseChoice) {
        const chinese = document.createElement("span");
        chinese.className = "answer-option-chinese";
        chinese.textContent = option.answerChinese;
        button.appendChild(chinese);

        if (option.answerPinyin) {
          const pinyin = document.createElement("span");
          pinyin.className = "answer-option-pinyin";
          pinyin.classList.toggle("hidden", !questionAnswerPinyinVisible);
          pinyin.textContent = option.answerPinyin;
          button.appendChild(pinyin);
        }
      } else {
        button.textContent = answer;
      }
      button.addEventListener("click", () => selectQuestionAnswer(answer, button));
      questionAnswerOptionsEl.appendChild(button);
    });
  }

  speakChinese(currentQuestion.question);
}

function updateQuestionAnswerRetryCount() {
  if (!questionAnswerIsRetryRound) return;

  const remainingQuestions = questionAnswerTotalQuestions - questionAnswerCorrectIds.size;
  questionAnswerProgressEl.textContent = `Còn sai: ${remainingQuestions} câu`;
}

function recordQuestionAnswer(isCorrect) {
  const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
  if (!currentQuestion) return;

  if (isCorrect) {
    questionAnswerCorrectIds.add(currentQuestion.id);
    questionAnswerScore = questionAnswerCorrectIds.size;
    questionAnswerScoreEl.textContent = questionAnswerScore;
    setFeedback(
      questionAnswerFeedbackEl,
      `✅ Đúng! ${formatChineseAnswer(currentQuestion.answerChinese, currentQuestion.answerPinyin)} — ${currentQuestion.answerMeaning}`,
      true
    );
  } else {
    if (!questionAnswerRoundMistakes.some(question => question.id === currentQuestion.id)) {
      questionAnswerRoundMistakes.push(currentQuestion);
    }
    setFeedback(
      questionAnswerFeedbackEl,
      `❌ Sai. Đáp án đúng là: ${formatChineseAnswer(currentQuestion.answerChinese, currentQuestion.answerPinyin)} — ${currentQuestion.answerMeaning}`,
      false
    );
  }

  questionAnswerQuestionTextEl.textContent = currentQuestion.question;
  questionAnswerQuestionPinyinEl.textContent = currentQuestion.questionPinyin;
  questionAnswerQuestionPinyinEl.classList.toggle("hidden", !questionAnswerPinyinVisible);
  questionAnswerQuestionMeaningEl.textContent = currentQuestion.questionMeaning;
  questionAnswerQuestionMeaningEl.classList.remove("hidden");
  questionAnswerReviewLabelEl.textContent = "Câu hỏi";
  questionAnswerAnswerMeaningEl.textContent = "";
  questionAnswerAnswerMeaningEl.classList.add("hidden");
  questionAnswerReviewEl.classList.remove("hidden");
  questionAnswerQuestionVisible = true;
  btnToggleQuestionAnswerQuestion.classList.add("hidden");
  btnToggleQuestionAnswerPinyin.classList.toggle("hidden", questionAnswerModeEl.value !== "chinese" && questionAnswerModeEl.value !== "chinese-choice");
  questionAnswerAnswered = true;
  updateQuestionAnswerRetryCount();
}

function selectQuestionAnswer(answer, selectedButton) {
  if (questionAnswerAnswered) return;

  const answerField = questionAnswerModeEl.value === "chinese-choice" ? "answerChinese" : "answerMeaning";
  const correctAnswer = questionAnswerQuestions[currentQuestionAnswerIndex][answerField];
  questionAnswerOptionsEl.querySelectorAll(".quiz-option-btn").forEach(button => {
    button.disabled = true;
    if (button.dataset.answer === correctAnswer) {
      button.classList.add("correct");
    }
  });

  const isCorrect = answer === correctAnswer;
  if (!isCorrect) selectedButton.classList.add("wrong");
  recordQuestionAnswer(isCorrect);
  btnNextQuestionAnswer.classList.remove("hidden");
}

btnCheckQuestionAnswer.addEventListener("click", () => {
  if (questionAnswerAnswered) {
    advanceQuestionAnswer();
    return;
  }

  const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
  if (!currentQuestion) return;

  const expectedAnswer = normalizeChineseAnswer(currentQuestion.answerChinese);
  const inputAnswer = normalizeChineseAnswer(questionAnswerInputEl.value);
  recordQuestionAnswer(inputAnswer === expectedAnswer);
  questionAnswerInputEl.disabled = true;
  btnCheckQuestionAnswer.textContent = "Câu tiếp theo ➡";
});

btnReplayQuestionAnswer.addEventListener("click", () => {
  const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
  if (currentQuestion) speakChinese(currentQuestion.question);
});

function advanceQuestionAnswer() {
  if (!questionAnswerAnswered) {
    const skippedQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
    if (skippedQuestion && !questionAnswerRoundMistakes.some(question => question.id === skippedQuestion.id)) {
      questionAnswerRoundMistakes.push(skippedQuestion);
    }
  }

  currentQuestionAnswerIndex++;
  loadQuestionAnswer();
}

btnNextQuestionAnswer.addEventListener("click", advanceQuestionAnswer);
btnToggleQuestionAnswerQuestion.addEventListener("click", () => {
  const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
  if (!currentQuestion || questionAnswerAnswered) return;

  questionAnswerQuestionVisible = !questionAnswerQuestionVisible;
  questionAnswerReviewEl.classList.toggle("hidden", !questionAnswerQuestionVisible);
  if (questionAnswerModeEl.value === "chinese") {
    questionAnswerReviewLabelEl.textContent = "Nghĩa tiếng Việt của câu trả lời";
    questionAnswerQuestionTextEl.textContent = "";
    questionAnswerQuestionPinyinEl.textContent = "";
    questionAnswerQuestionMeaningEl.textContent = "";
    questionAnswerAnswerMeaningEl.textContent = questionAnswerQuestionVisible ? currentQuestion.answerMeaning : "";
    questionAnswerAnswerMeaningEl.classList.toggle("hidden", !questionAnswerQuestionVisible);
    btnToggleQuestionAnswerQuestion.textContent = questionAnswerQuestionVisible
      ? "Ẩn nghĩa tiếng Việt của câu trả lời"
      : "Hiển thị nghĩa tiếng Việt của câu trả lời";
    btnToggleQuestionAnswerQuestion.setAttribute("aria-expanded", String(questionAnswerQuestionVisible));
    return;
  }

  questionAnswerReviewLabelEl.textContent = "Câu hỏi";
  questionAnswerQuestionTextEl.textContent = questionAnswerQuestionVisible ? currentQuestion.question : "";
  questionAnswerQuestionPinyinEl.textContent = questionAnswerQuestionVisible ? currentQuestion.questionPinyin : "";
  questionAnswerQuestionPinyinEl.classList.toggle("hidden", !questionAnswerPinyinVisible);
  questionAnswerAnswerMeaningEl.textContent = "";
  questionAnswerAnswerMeaningEl.classList.add("hidden");
  btnToggleQuestionAnswerQuestion.textContent = questionAnswerQuestionVisible ? "Ẩn câu hỏi" : "Hiển thị câu hỏi";
  btnToggleQuestionAnswerQuestion.setAttribute("aria-expanded", String(questionAnswerQuestionVisible));
  btnToggleQuestionAnswerPinyin.classList.toggle("hidden", !questionAnswerQuestionVisible);
});
btnToggleQuestionAnswerPinyin.addEventListener("click", () => {
  questionAnswerPinyinVisible = !questionAnswerPinyinVisible;
  btnToggleQuestionAnswerPinyin.textContent = questionAnswerPinyinVisible ? "Ẩn pinyin" : "Hiện pinyin";
  btnToggleQuestionAnswerPinyin.setAttribute("aria-pressed", String(questionAnswerPinyinVisible));
  questionAnswerOptionsEl.querySelectorAll(".answer-option-pinyin").forEach(pinyin => {
    pinyin.classList.toggle("hidden", !questionAnswerPinyinVisible);
  });
  questionAnswerQuestionPinyinEl.classList.toggle("hidden", !questionAnswerPinyinVisible);
});
questionAnswerModeEl.addEventListener("change", () => {
  if (getFilteredQuestionAnswers().length < 4) {
    startQuestionAnswerPractice(false, false);
    return;
  }
  loadQuestionAnswer();
});

function updateTopicOptions() {
  const availableWords = getAvailableWords();
  const topics = [...new Set(availableWords.map(item => item.topic).filter(Boolean))];
  const previousSelectAll = topicFilterOptionsEl.querySelector("[data-topic-all]");
  const previousTopics = new Set(
    [...topicFilterOptionsEl.querySelectorAll("[data-topic-value]:checked")]
      .map(input => input.value)
  );
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.dataset.topicAll = "";
  const selectAllOption = document.createElement("label");
  selectAllOption.className = "topic-filter-option";
  selectAllOption.append(selectAll, document.createElement("span"));
  selectAllOption.lastElementChild.textContent = "Tất cả chủ đề";

  topicFilterOptionsEl.replaceChildren(selectAllOption);

  topics.forEach(topic => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = topic;
    checkbox.dataset.topicValue = "";
    checkbox.checked = previousSelectAll
      ? previousSelectAll.checked || previousTopics.has(topic)
      : true;

    const option = document.createElement("label");
    option.className = "topic-filter-option";
    option.append(checkbox, document.createElement("span"));
    option.lastElementChild.textContent = topic;
    topicFilterOptionsEl.appendChild(option);
  });

  const checkedCount = topicFilterOptionsEl.querySelectorAll("[data-topic-value]:checked").length;
  if (!previousSelectAll || (!previousSelectAll.checked && checkedCount === 0)) {
    topicFilterOptionsEl.querySelectorAll("[data-topic-value]").forEach(input => {
      input.checked = true;
    });
  }
  updateSelectAllTopicOption();
  updateTopicFilterSelection();
}

function getSelectedTopics() {
  const selectAll = topicFilterOptionsEl.querySelector("[data-topic-all]");
  if (!selectAll || selectAll.checked) return null;

  return new Set(
    [...topicFilterOptionsEl.querySelectorAll("[data-topic-value]:checked")]
      .map(input => input.value)
  );
}

function updateSelectAllTopicOption() {
  const selectAll = topicFilterOptionsEl.querySelector("[data-topic-all]");
  if (!selectAll) return;

  const topics = topicFilterOptionsEl.querySelectorAll("[data-topic-value]");
  const selectedCount = topicFilterOptionsEl.querySelectorAll("[data-topic-value]:checked").length;
  selectAll.checked = topics.length > 0 && selectedCount === topics.length;
}

function updateTopicFilterSelection() {
  const selectAll = topicFilterOptionsEl.querySelector("[data-topic-all]");
  const selectedTopics = [...topicFilterOptionsEl.querySelectorAll("[data-topic-value]:checked")];

  if (selectAll?.checked) {
    topicFilterSelectionEl.textContent = "Tất cả chủ đề";
    return;
  }

  if (selectedTopics.length === 0) {
    topicFilterSelectionEl.textContent = "Không có chủ đề";
    return;
  }

  topicFilterSelectionEl.textContent = selectedTopics.length === 1
    ? selectedTopics[0].value
    : `${selectedTopics.length} chủ đề đã chọn`;
}

topicFilterToggleEl.addEventListener("click", () => {
  const isOpen = topicFilterToggleEl.getAttribute("aria-expanded") === "true";
  topicFilterToggleEl.setAttribute("aria-expanded", String(!isOpen));
  topicFilterOptionsEl.classList.toggle("hidden", isOpen);
});

document.addEventListener("click", event => {
  if (!topicFilterEl.contains(event.target)) {
    topicFilterToggleEl.setAttribute("aria-expanded", "false");
    topicFilterOptionsEl.classList.add("hidden");
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    topicFilterToggleEl.setAttribute("aria-expanded", "false");
    topicFilterOptionsEl.classList.add("hidden");
  }
});

topicFilterOptionsEl.addEventListener("change", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.matches("[data-topic-all]")) {
    topicFilterOptionsEl.querySelectorAll("[data-topic-value]").forEach(input => {
      input.checked = target.checked;
    });
  } else {
    updateSelectAllTopicOption();
  }

  updateTopicFilterSelection();
  applyStudyMode();
});

function updateDataSourceOptions() {
  dataSourceEl.replaceChildren(new Option("Tất cả bộ từ", "all"));

  DATA_SOURCES.forEach(({ id: sourceId, label: sourceLabel }) => {
    const option = document.createElement("option");
    option.value = sourceId;
    option.textContent = sourceLabel;
    dataSourceEl.appendChild(option);
  });
}

let typingQuestions = [];
let currentTypingIndex = 0;
let typingScore = 0;
let typingTotalQuestions = 0;
let typingRoundMistakes = [];
let typingCorrectIds = new Set();
let typingIsRetryRound = false;
let typingAnswered = false;
let typingShouldShuffle = false;

function startTypingPractice(shouldShuffle = false) {
  const filteredWords = getFilteredWords();
  if (filteredWords.length === 0) {
    alert("Không có từ vựng nào trong bộ lọc hiện tại để luyện gõ!");
    return;
  }

  typingShouldShuffle = shouldShuffle;
  typingQuestions = shouldShuffle ? shuffleList(filteredWords) : [...filteredWords];

  currentTypingIndex = 0;
  typingScore = 0;
  typingTotalQuestions = filteredWords.length;
  typingRoundMistakes = [];
  typingCorrectIds = new Set();
  typingIsRetryRound = false;
  typingScoreEl.textContent = typingScore;
  setFeedback(typingFeedbackEl, "");
  typingInputEl.value = "";
  renderTypingQuestion();
}

function renderTypingQuestion() {
  typingInputEl.value = "";
  typingInputEl.focus();

  const currentWord = typingQuestions[currentTypingIndex];
  const isExampleMode = typingContentModeEl.value === "example";
  const vietnameseText = isExampleMode
    ? (currentWord.exampleMeaning || currentWord.meaning)
    : currentWord.meaning;

  typingPromptEl.textContent = isExampleMode
    ? "Nhìn nghĩa tiếng Việt của câu ví dụ rồi gõ câu đó bằng chữ Hán"
    : "Nhìn nghĩa tiếng Việt rồi gõ từ bằng chữ Hán";
  typingInputLabelEl.textContent = isExampleMode
    ? "Gõ câu ví dụ bằng chữ Hán"
    : "Gõ từ bằng chữ Hán";
  typingWordEl.textContent = vietnameseText;
  typingPhoneticEl.textContent = "";
  typingInputEl.placeholder = isExampleMode
    ? "Nhập câu ví dụ bằng chữ Hán..."
    : "Nhập từ bằng chữ Hán...";
  typingProgressEl.textContent = typingIsRetryRound
    ? `Còn sai: ${typingTotalQuestions - typingCorrectIds.size} câu`
    : `Câu ${currentTypingIndex + 1} / ${typingQuestions.length}`;
  typingInputEl.disabled = false;
  btnCheckTyping.disabled = false;
  btnCheckTyping.textContent = "Kiểm tra";
  typingAnswered = false;
  setFeedback(typingFeedbackEl, "");
}

function updateTypingRetryCount() {
  if (!typingIsRetryRound) return;

  const remainingQuestions = typingTotalQuestions - typingCorrectIds.size;
  typingProgressEl.textContent = `Còn sai: ${remainingQuestions} câu`;
}

btnCheckTyping.addEventListener("click", () => {
  if (typingAnswered) {
    advanceTypingQuestion();
    return;
  }

  if (currentTypingIndex >= typingQuestions.length) return;

  const currentWord = typingQuestions[currentTypingIndex];
  const isExampleMode = typingContentModeEl.value === "example";
  const chineseText = isExampleMode ? currentWord.example : currentWord.word;
  const phoneticText = isExampleMode ? currentWord.examplePhonetic : currentWord.phonetic;
  const correctValues = chineseText
    .split(",")
    .map(normalizeChineseAnswer);
  const inputValue = normalizeChineseAnswer(typingInputEl.value);

  if (correctValues.includes(inputValue)) {
    typingCorrectIds.add(currentWord.id);
    typingScore = typingCorrectIds.size;
    typingScoreEl.textContent = typingScore;
    setFeedback(typingFeedbackEl, `✅ Đúng! Đáp án: ${formatChineseAnswer(chineseText, phoneticText)}`, true);
  } else {
    if (!typingRoundMistakes.some(word => word.id === currentWord.id)) {
      typingRoundMistakes.push(currentWord);
    }
    setFeedback(
      typingFeedbackEl,
      `❌ Sai. Đáp án đúng là: ${formatChineseAnswer(chineseText, phoneticText)}`,
      false
    );
  }

  if (typingPronunciationEnabledEl.checked) {
    speakChinese(chineseText);
  }

  updateTypingRetryCount();

  typingAnswered = true;
  typingInputEl.disabled = true;
  btnCheckTyping.disabled = false;
  btnCheckTyping.textContent = "Câu tiếp theo ➡";
});

function advanceTypingQuestion() {
  currentTypingIndex++;

  if (currentTypingIndex >= typingQuestions.length) {
    if (typingRoundMistakes.length > 0) {
      typingQuestions = typingShouldShuffle ? shuffleList(typingRoundMistakes) : [...typingRoundMistakes];
      typingRoundMistakes = [];
      typingIsRetryRound = true;
      currentTypingIndex = 0;
    } else {
      typingProgressEl.textContent = "Đã hoàn thành";
      typingPromptEl.textContent = "Hoàn thành!";
      typingWordEl.textContent = `Bạn đã đúng hết ${typingScore} câu.`;
      typingPhoneticEl.textContent = "";
      setFeedback(typingFeedbackEl, "Bạn có thể bấm Xáo trộn để ôn lại theo thứ tự mới.", true);
      typingInputEl.value = "";
      typingInputEl.disabled = true;
      btnCheckTyping.disabled = true;
      btnCheckTyping.textContent = "Hoàn thành";
      return;
    }
  }

  renderTypingQuestion();
}

typingContentModeEl.addEventListener("change", () => startTypingPractice());

let readingQuestions = [];
let currentReadingIndex = 0;
let readingScore = 0;
let readingTotalQuestions = 0;
let readingRoundMistakes = [];
let readingCorrectIds = new Set();
let readingIsRetryRound = false;
let readingAnswered = false;
let readingShouldShuffle = false;
let readingAnswerWasCorrect = null;
let speakingQuestions = [];
let currentSpeakingIndex = 0;
let speakingShouldShuffle = false;
let speakingIsComplete = false;
let speakingRecorder = null;
let speakingStream = null;
let speakingChunks = [];
let speakingAudioUrl = "";
let speakingRecordingVersion = 0;
let speakingRecordingTimer = null;
let speakingPermissionRequestId = 0;
let speakingIsRequestingPermission = false;

function getReadingQuestions(words) {
  return words.flatMap(word => [
    {
      id: `${word.id}-example`,
      sentence: word.example,
      sentencePinyin: word.examplePhonetic
    },
    {
      id: `${word.id}-answer`,
      sentence: word.answerChinese,
      sentencePinyin: word.answerPinyin
    }
  ]
    .filter(question => question.sentence && question.sentence.includes(word.word))
    .map(question => ({
      ...word,
      id: question.id,
      sentence: question.sentence,
      sentencePinyin: question.sentencePinyin
    })));
}

function normalizePinyinForMatch(value) {
  return [...value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()]
    .filter(character => /[a-z]/.test(character))
    .join("");
}

function getPinyinRangeForWord(sentencePinyin, wordPinyin) {
  const sourceCharacters = [];
  for (let offset = 0; offset < sentencePinyin.length;) {
    const character = String.fromCodePoint(sentencePinyin.codePointAt(offset));
    const normalizedCharacters = normalizePinyinForMatch(character);
    for (const normalizedCharacter of normalizedCharacters) {
      sourceCharacters.push({
        character: normalizedCharacter,
        start: offset,
        end: offset + character.length
      });
    }
    offset += character.length;
  }

  const normalizedSource = sourceCharacters.map(item => item.character).join("");
  const normalizedTarget = normalizePinyinForMatch(wordPinyin);
  const startIndex = normalizedSource.indexOf(normalizedTarget);
  if (startIndex < 0 || !normalizedTarget) return null;

  let start = sourceCharacters[startIndex].start;
  let end = sourceCharacters[startIndex + normalizedTarget.length - 1].end;
  while (start > 0 && /\s/.test(sentencePinyin[start - 1])) start--;
  while (end < sentencePinyin.length && /\s/.test(sentencePinyin[end])) end++;

  return {
    start,
    end,
    width: Math.max(1.2, normalizedTarget.length * 0.48)
  };
}

function renderReadingPinyin(currentWord) {
  const pinyinRange = getPinyinRangeForWord(currentWord.sentencePinyin, currentWord.phonetic);
  const canShowPinyin = Boolean(currentWord.sentencePinyin && pinyinRange);
  readingPinyinEl.replaceChildren();

  if (canShowPinyin) {
    const pinyinBlank = document.createElement("span");
    pinyinBlank.className = "reading-pinyin-blank";
    pinyinBlank.setAttribute("aria-hidden", "true");
    pinyinBlank.style.setProperty("--reading-pinyin-blank-width", `${pinyinRange.width}em`);
    readingPinyinEl.append(
      document.createTextNode(currentWord.sentencePinyin.slice(0, pinyinRange.start)),
      pinyinBlank,
      document.createTextNode(currentWord.sentencePinyin.slice(pinyinRange.end))
    );
  }

  readingPinyinEl.classList.toggle("hidden", !readingPinyinVisible || !canShowPinyin);
  btnToggleReadingPinyin.classList.toggle("hidden", !canShowPinyin);
}

function updateReadingAnswerFeedback() {
  const currentWord = readingQuestions[currentReadingIndex];
  if (!currentWord || readingAnswerWasCorrect === null) return;

  const pinyin = readingPinyinVisible ? currentWord.phonetic : "";
  const prefix = readingAnswerWasCorrect ? "✅ Đúng! Đáp án: " : "❌ Sai. Đáp án đúng là: ";
  setFeedback(
    readingFeedbackEl,
    `${prefix}${formatChineseAnswer(currentWord.word, pinyin)}`,
    readingAnswerWasCorrect
  );
}

function startReadingPractice(shouldShuffle = false) {
  const filteredWords = getReadingQuestions(getFilteredWords());
  if (filteredWords.length === 0) {
    alert("Bộ từ hiện tại chưa có câu ví dụ hoặc câu trả lời phù hợp để luyện đọc điền từ!");
    return;
  }

  readingShouldShuffle = shouldShuffle;
  readingQuestions = shouldShuffle ? shuffleList(filteredWords) : [...filteredWords];
  currentReadingIndex = 0;
  readingScore = 0;
  readingTotalQuestions = filteredWords.length;
  readingRoundMistakes = [];
  readingCorrectIds = new Set();
  readingIsRetryRound = false;
  readingScoreEl.textContent = readingScore;
  renderReadingQuestion();
}

function renderReadingQuestion() {
  const currentWord = readingQuestions[currentReadingIndex];
  if (!currentWord) return;

  const blankIndex = currentWord.sentence.indexOf(currentWord.word);
  const readingBlank = document.createElement("span");
  readingBlank.className = "reading-blank";
  readingSentenceEl.replaceChildren(
    document.createTextNode(currentWord.sentence.slice(0, blankIndex)),
    readingBlank,
    document.createTextNode(currentWord.sentence.slice(blankIndex + currentWord.word.length))
  );
  renderReadingPinyin(currentWord);
  btnToggleReadingPinyin.textContent = readingPinyinVisible ? "Ẩn pinyin" : "Hiện pinyin";
  btnToggleReadingPinyin.setAttribute("aria-expanded", String(readingPinyinVisible));
  readingProgressEl.textContent = readingIsRetryRound
    ? `Còn sai: ${readingTotalQuestions - readingCorrectIds.size} câu`
    : `Câu ${currentReadingIndex + 1} / ${readingQuestions.length}`;
  readingOptionsEl.replaceChildren();
  const isChoiceMode = readingAnswerModeEl.value === "choice";
  readingInputEl.classList.toggle("hidden", isChoiceMode);
  readingOptionsEl.classList.toggle("hidden", !isChoiceMode);
  readingInputEl.value = "";
  readingInputEl.disabled = false;
  if (isChoiceMode) {
    const choicesByWord = new Map(getFilteredWords()
      .filter(word => word.word !== currentWord.word)
      .map(word => [word.word, word]));
    const options = shuffleList([
      ...shuffleList([...choicesByWord.values()]).slice(0, 3),
      currentWord
    ]);
    options.forEach(option => {
      const button = document.createElement("button");
      button.className = "quiz-option-btn";
      button.dataset.answer = option.word;
      const chinese = document.createElement("span");
      chinese.className = "answer-option-chinese";
      chinese.textContent = option.word;
      button.appendChild(chinese);

      if (option.phonetic) {
        const pinyin = document.createElement("span");
        pinyin.className = "answer-option-pinyin reading-option-pinyin";
        pinyin.classList.toggle("hidden", !readingPinyinVisible);
        pinyin.textContent = option.phonetic;
        button.appendChild(pinyin);
      }
      button.addEventListener("click", () => selectReadingAnswer(option.word, button));
      readingOptionsEl.appendChild(button);
    });
  }
  btnCheckReading.disabled = false;
  btnCheckReading.textContent = "Kiểm tra";
  btnCheckReading.classList.toggle("hidden", isChoiceMode);
  readingAnswerWasCorrect = null;
  setFeedback(readingFeedbackEl, "");
  readingAnswered = false;
  if (!isChoiceMode) readingInputEl.focus();
}

function checkReadingAnswer(answer) {
  const currentWord = readingQuestions[currentReadingIndex];
  if (!currentWord || readingAnswered) return;

  const isCorrect = normalizeAnswer(answer) === normalizeAnswer(currentWord.word);
  readingAnswerWasCorrect = isCorrect;
  if (isCorrect) {
    readingCorrectIds.add(currentWord.id);
    readingScore = readingCorrectIds.size;
    readingScoreEl.textContent = readingScore;
  } else {
    if (!readingRoundMistakes.some(word => word.id === currentWord.id)) {
      readingRoundMistakes.push(currentWord);
    }
  }
  updateReadingAnswerFeedback();

  if (readingPronunciationEnabledEl.checked) {
    speakChinese(currentWord.word);
  }

  readingAnswered = true;
  readingInputEl.disabled = true;
  readingOptionsEl.querySelectorAll(".quiz-option-btn").forEach(button => {
    button.disabled = true;
    if (button.dataset.answer === currentWord.word) button.classList.add("correct");
  });
  btnCheckReading.textContent = "Câu tiếp theo ➡";
  btnCheckReading.classList.remove("hidden");
  if (readingIsRetryRound) {
    readingProgressEl.textContent = `Còn sai: ${readingTotalQuestions - readingCorrectIds.size} câu`;
  }
}

function selectReadingAnswer(answer, selectedButton) {
  if (readingAnswered) return;

  checkReadingAnswer(answer);
  if (answer !== readingQuestions[currentReadingIndex]?.word) {
    selectedButton.classList.add("wrong");
  }
}

function advanceReadingQuestion() {
  currentReadingIndex++;
  if (currentReadingIndex >= readingQuestions.length) {
    if (readingRoundMistakes.length > 0) {
      readingQuestions = readingShouldShuffle ? shuffleList(readingRoundMistakes) : [...readingRoundMistakes];
      readingRoundMistakes = [];
      readingIsRetryRound = true;
      currentReadingIndex = 0;
    } else {
      readingProgressEl.textContent = "Đã hoàn thành";
      readingSentenceEl.textContent = `Bạn đã đúng hết ${readingScore} câu.`;
      readingInputEl.value = "";
      readingInputEl.disabled = true;
      readingInputEl.classList.add("hidden");
      readingOptionsEl.classList.add("hidden");
      btnCheckReading.disabled = true;
      btnCheckReading.textContent = "Hoàn thành";
      return;
    }
  }
  renderReadingQuestion();
}

btnCheckReading.addEventListener("click", () => {
  if (readingAnswered) {
    advanceReadingQuestion();
    return;
  }

  if (readingAnswerModeEl.value === "choice") return;
  checkReadingAnswer(readingInputEl.value);
});

readingAnswerModeEl.addEventListener("change", renderReadingQuestion);

btnToggleReadingPinyin.addEventListener("click", () => {
  readingPinyinVisible = !readingPinyinVisible;
  const currentWord = readingQuestions[currentReadingIndex];
  if (currentWord) renderReadingPinyin(currentWord);
  readingOptionsEl.querySelectorAll(".reading-option-pinyin").forEach(pinyin => {
    pinyin.classList.toggle("hidden", !readingPinyinVisible);
  });
  updateReadingAnswerFeedback();
  btnToggleReadingPinyin.textContent = readingPinyinVisible ? "Ẩn pinyin" : "Hiện pinyin";
  btnToggleReadingPinyin.setAttribute("aria-expanded", String(readingPinyinVisible));
});

function startSpeakingPractice(shouldShuffle = false) {
  stopSpeakingRecording();
  speakingShouldShuffle = shouldShuffle;
  const filteredWords = getFilteredWords();
  speakingQuestions = shouldShuffle ? shuffleList(filteredWords) : [...filteredWords];
  currentSpeakingIndex = 0;
  speakingIsComplete = false;
  btnNextSpeaking.textContent = "Câu tiếp theo ➡";
  btnNextSpeaking.disabled = false;
  renderSpeakingQuestion();
}

function clearSpeakingRecording() {
  speakingRecordingVersion++;
  if (speakingAudioUrl) {
    URL.revokeObjectURL(speakingAudioUrl);
    speakingAudioUrl = "";
  }

  speakingPlaybackEl.pause();
  speakingPlaybackEl.removeAttribute("src");
  speakingPlaybackEl.load();
  speakingPlaybackEl.classList.add("hidden");
}

function renderSpeakingQuestion() {
  clearSpeakingRecording();
  speakingAnswerEl.classList.add("hidden");
  btnRevealSpeakingAnswer.textContent = "Hiện câu mẫu";

  const currentWord = speakingQuestions[currentSpeakingIndex];
  if (!currentWord) {
    speakingIsComplete = true;
    speakingProgressEl.textContent = "Đã hoàn thành";
    speakingPromptEl.textContent = speakingQuestions.length
      ? "Bạn đã luyện xong bộ từ này."
      : "Không có từ nào trong bộ lọc hiện tại.";
    speakingTargetEl.textContent = "";
    speakingPhoneticEl.textContent = "";
    speakingSampleEl.textContent = "";
    speakingSamplePhoneticEl.textContent = "";
    btnStartSpeakingRecording.disabled = true;
    btnStopSpeakingRecording.disabled = true;
    btnNextSpeaking.textContent = speakingQuestions.length ? "Luyện lại" : "Thử lại";
    speakingStatusEl.textContent = "Chọn bộ từ khác hoặc luyện lại để tiếp tục.";
    return;
  }

  speakingIsComplete = false;
  speakingProgressEl.textContent = `Câu ${currentSpeakingIndex + 1} / ${speakingQuestions.length}`;
  speakingPromptEl.textContent = `Hãy nói một câu tiếng Trung có nghĩa: ${currentWord.exampleMeaning || currentWord.meaning}`;
  speakingTargetEl.textContent = currentWord.word;
  speakingPhoneticEl.textContent = currentWord.phonetic || "";
  speakingSampleEl.textContent = currentWord.example || currentWord.word;
  speakingSamplePhoneticEl.textContent = currentWord.examplePhonetic || currentWord.phonetic || "";
  speakingStatusEl.textContent = "Bấm ghi âm, nói câu tiếng Trung rồi nghe lại.";
  btnStartSpeakingRecording.disabled = false;
  btnStopSpeakingRecording.disabled = true;
  btnStopSpeakingRecording.textContent = "Dừng ghi âm";
}

async function startSpeakingRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    speakingStatusEl.textContent = "Trình duyệt này chưa hỗ trợ ghi âm. Hãy thử mở app bằng Safari trên iPhone.";
    return;
  }

  if (speakingIsRequestingPermission) return;

  clearSpeakingRecording();
  const requestId = ++speakingPermissionRequestId;
  speakingIsRequestingPermission = true;
  btnStartSpeakingRecording.disabled = true;
  btnStopSpeakingRecording.disabled = false;
  btnStopSpeakingRecording.textContent = "Hủy yêu cầu";
  btnNextSpeaking.disabled = true;
  speakingStatusEl.textContent = "Đang chờ quyền truy cập micro…";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (requestId !== speakingPermissionRequestId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    speakingIsRequestingPermission = false;
    speakingStream = stream;
    speakingChunks = [];
    const supportedType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
      .find(type => MediaRecorder.isTypeSupported?.(type));
    speakingRecorder = supportedType
      ? new MediaRecorder(speakingStream, { mimeType: supportedType })
      : new MediaRecorder(speakingStream);
    const recordingVersion = speakingRecordingVersion;

    speakingRecorder.addEventListener("dataavailable", event => {
      if (event.data.size > 0) speakingChunks.push(event.data);
    });
    speakingRecorder.addEventListener("stop", () => {
      if (recordingVersion === speakingRecordingVersion && speakingChunks.length > 0) {
        const recording = new Blob(speakingChunks, { type: speakingRecorder.mimeType || "audio/mp4" });
        speakingAudioUrl = URL.createObjectURL(recording);
        speakingPlaybackEl.src = speakingAudioUrl;
        speakingPlaybackEl.classList.remove("hidden");
        speakingStatusEl.textContent = "Ghi âm xong. Bản ghi chỉ ở trong tab này; nghe lại bên dưới.";
      }

      clearTimeout(speakingRecordingTimer);
      speakingRecordingTimer = null;
      speakingStream?.getTracks().forEach(track => track.stop());
      speakingStream = null;
      btnStartSpeakingRecording.disabled = false;
      btnStopSpeakingRecording.disabled = true;
      btnStopSpeakingRecording.textContent = "Dừng ghi âm";
      btnNextSpeaking.disabled = false;
    });

    speakingRecorder.start();
    speakingRecordingTimer = setTimeout(stopSpeakingRecording, 25000);
    btnStartSpeakingRecording.disabled = true;
    btnStopSpeakingRecording.disabled = false;
    btnStopSpeakingRecording.textContent = "Dừng ghi âm";
    btnNextSpeaking.disabled = true;
    speakingStatusEl.textContent = "Đang ghi âm… Nói câu tiếng Trung rồi bấm Dừng ghi âm.";
  } catch (error) {
    if (requestId !== speakingPermissionRequestId) return;

    speakingIsRequestingPermission = false;
    speakingStream?.getTracks().forEach(track => track.stop());
    speakingStream = null;
    btnStartSpeakingRecording.disabled = false;
    btnStopSpeakingRecording.disabled = true;
    btnStopSpeakingRecording.textContent = "Dừng ghi âm";
    btnNextSpeaking.disabled = false;
    speakingStatusEl.textContent = error.name === "NotAllowedError"
      ? "Chưa được cấp quyền micro. Hãy cho phép Safari sử dụng micro rồi thử lại."
      : "Không mở được micro. Hãy kiểm tra quyền truy cập và thử lại.";
  }
}

function stopSpeakingRecording() {
  clearTimeout(speakingRecordingTimer);
  speakingRecordingTimer = null;
  if (speakingIsRequestingPermission) {
    speakingPermissionRequestId++;
    speakingIsRequestingPermission = false;
    btnStartSpeakingRecording.disabled = false;
    btnStopSpeakingRecording.disabled = true;
    btnStopSpeakingRecording.textContent = "Dừng ghi âm";
    btnNextSpeaking.disabled = false;
    speakingStatusEl.textContent = "Đã hủy yêu cầu truy cập micro.";
    return;
  }

  if (speakingRecorder?.state === "recording") {
    speakingRecorder.stop();
  }
}

btnRevealSpeakingAnswer.addEventListener("click", () => {
  const isHidden = speakingAnswerEl.classList.toggle("hidden");
  btnRevealSpeakingAnswer.textContent = isHidden ? "Hiện câu mẫu" : "Ẩn câu mẫu";
});

btnSpeakSpeakingAnswer.addEventListener("click", () => {
  const currentWord = speakingQuestions[currentSpeakingIndex];
  if (currentWord) speakChinese(currentWord.example || currentWord.word);
});

btnStartSpeakingRecording.addEventListener("click", startSpeakingRecording);
btnStopSpeakingRecording.addEventListener("click", stopSpeakingRecording);
btnNextSpeaking.addEventListener("click", () => {
  if (speakingIsComplete) {
    startSpeakingPractice(speakingShouldShuffle);
    return;
  }

  currentSpeakingIndex++;
  renderSpeakingQuestion();
});

function applyStudyMode() {
  const mode = studyModeEl.value;
  topicFilterEl.classList.toggle("hidden", mode !== "topic");
  topicFilterLabelEl.classList.toggle("hidden", mode !== "topic");

  updateSelectedWordCount();

  if (currentMode === "matching") {
    startMatching();
    return;
  }

  if (currentMode === "quiz") {
    startQuiz();
    return;
  }

  if (currentMode === "listening") {
    startListeningPractice();
    return;
  }

  if (currentMode === "question-answer") {
    startQuestionAnswerPractice(false, false);
    return;
  }

  if (currentMode === "typing") {
    startTypingPractice();
    return;
  }

  if (currentMode === "reading") {
    startReadingPractice();
    return;
  }

  if (currentMode === "speaking") {
    startSpeakingPractice();
  }
}

studyModeEl.addEventListener("change", () => {
  if (studyModeEl.value === "topic") {
    updateTopicOptions();
  }
  applyStudyMode();
});

dataSourceEl.addEventListener("change", () => {
  updateTopicOptions();
  updateStudyModeAvailability();
  applyStudyMode();
});

function getSelectedGrammarLesson() {
  return grammarLessons.find(lesson => lesson.id === grammarLessonEl.value);
}

function updateGrammarLessonOptions(selectedLessonId) {
  const lessons = grammarLessons.filter(lesson =>
    lesson.level === grammarLevelEl.value && lesson.topic === grammarTopicEl.value
  );
  grammarLessonEl.replaceChildren(...lessons.map(lesson =>
    new Option(`${lesson.order}. ${lesson.title}`, lesson.id)
  ));

  if (lessons.length > 0) {
    grammarLessonEl.value = lessons.some(lesson => lesson.id === selectedLessonId)
      ? selectedLessonId
      : lessons[0].id;
  }
}

function updateGrammarTopics(selectedTopic) {
  const topics = [...new Set(grammarLessons
    .filter(lesson => lesson.level === grammarLevelEl.value)
    .map(lesson => lesson.topic))];
  grammarTopicEl.replaceChildren(...topics.map(topic => new Option(topic, topic)));

  if (topics.length > 0) {
    grammarTopicEl.value = topics.includes(selectedTopic) ? selectedTopic : topics[0];
  }
  updateGrammarLessonOptions();
}

function resetGrammarPractice() {
  grammarPracticeEl.classList.add("hidden");
  grammarCompletionEl.classList.add("hidden");
  grammarPracticeAnswered = false;
  currentGrammarPracticeIndex = 0;
  grammarPracticeQuestions = [];
  grammarPracticeMistakes = [];
  grammarPracticeCorrectIds = new Set();
  grammarPracticeIsRetryRound = false;
}

function renderGrammarLesson() {
  resetGrammarPractice();
  const lesson = getSelectedGrammarLesson();
  grammarLessonContentEl.classList.toggle("hidden", !lesson);
  grammarStartPracticeBtn.disabled = !lesson;
  if (!lesson) return;

  grammarLessonMetaEl.textContent = `${lesson.level} · ${lesson.topic} · Bài ${lesson.order}`;
  grammarHeadingEl.textContent = lesson.title;
  grammarStructureEl.textContent = lesson.structure;
  grammarExplanationEl.textContent = lesson.explanation;
  grammarExamplesListEl.replaceChildren();

  lesson.examples.forEach(example => {
    const item = document.createElement("article");
    item.className = "grammar-example";

    const chinese = document.createElement("p");
    chinese.className = "grammar-example-chinese";
    chinese.lang = "zh";
    chinese.textContent = example.chinese;

    const pinyin = document.createElement("p");
    pinyin.className = "grammar-example-pinyin";
    pinyin.textContent = example.pinyin;

    const meaning = document.createElement("p");
    meaning.className = "grammar-example-meaning";
    meaning.textContent = example.meaning;

    item.append(chinese, pinyin, meaning);
    grammarExamplesListEl.appendChild(item);
  });
}

function renderGrammarPracticeQuestion() {
  const lesson = getSelectedGrammarLesson();
  if (!lesson) return;

  if (currentGrammarPracticeIndex >= grammarPracticeQuestions.length) {
    if (grammarPracticeMistakes.length > 0) {
      grammarPracticeQuestions = [...grammarPracticeMistakes];
      grammarPracticeMistakes = [];
      grammarPracticeIsRetryRound = true;
      currentGrammarPracticeIndex = 0;
    } else {
      grammarPracticeEl.classList.add("hidden");
      grammarCompletionEl.classList.remove("hidden");
      grammarCompletionScoreEl.textContent =
        `Bạn đã trả lời đúng hết ${grammarPracticeCorrectIds.size} câu.`;
      const lessonIndex = grammarLessons.findIndex(item => item.id === lesson.id);
      grammarNextLessonBtn.disabled = lessonIndex >= grammarLessons.length - 1;
      grammarNextLessonBtn.textContent = grammarNextLessonBtn.disabled
        ? "Đã hết bài"
        : "Bài tiếp theo";
      grammarRetryPracticeBtn.focus();
      return;
    }
  }

  const practice = grammarPracticeQuestions[currentGrammarPracticeIndex];
  grammarPracticeAnswered = false;
  grammarPracticeProgressEl.textContent = grammarPracticeIsRetryRound
    ? `Còn sai: ${lesson.practice.length - grammarPracticeCorrectIds.size} câu`
    : `Câu ${currentGrammarPracticeIndex + 1} / ${grammarPracticeQuestions.length}`;
  grammarPracticeScoreEl.textContent =
    `${grammarPracticeCorrectIds.size} / ${lesson.practice.length}`;
  grammarPracticePromptEl.textContent = practice.vietnamese;
  grammarAnswerEl.value = "";
  grammarAnswerEl.disabled = false;
  grammarPracticeFeedbackEl.textContent = "";
  grammarPracticeFeedbackEl.className = "grammar-feedback";
  grammarPracticeReferenceEl.classList.add("hidden");
  grammarReferenceAnswerEl.textContent = practice.chinese;
  grammarReferencePinyinEl.textContent = practice.pinyin;
  grammarCheckAnswerBtn.classList.remove("hidden");
  grammarCheckAnswerBtn.disabled = false;
  grammarRevealAnswerBtn.classList.remove("hidden");
  grammarNextQuestionBtn.classList.add("hidden");
  grammarAnswerEl.focus();
}

function startGrammarPractice() {
  const lesson = getSelectedGrammarLesson();
  if (!lesson || lesson.practice.length === 0) return;

  currentGrammarPracticeIndex = 0;
  grammarPracticeQuestions = [...lesson.practice];
  grammarPracticeMistakes = [];
  grammarPracticeCorrectIds = new Set();
  grammarPracticeIsRetryRound = false;
  grammarLessonContentEl.classList.add("hidden");
  grammarCompletionEl.classList.add("hidden");
  grammarPracticeEl.classList.remove("hidden");
  renderGrammarPracticeQuestion();
}

function revealGrammarAnswer(isCorrect, wasChecked = true) {
  const practice = grammarPracticeQuestions[currentGrammarPracticeIndex];
  if (!practice) return;

  grammarPracticeAnswered = true;
  grammarAnswerEl.disabled = true;
  grammarPracticeReferenceEl.classList.remove("hidden");
  grammarCheckAnswerBtn.classList.add("hidden");
  grammarRevealAnswerBtn.classList.add("hidden");
  grammarNextQuestionBtn.classList.remove("hidden");
  grammarPracticeFeedbackEl.className = wasChecked
    ? isCorrect ? "grammar-feedback is-correct" : "grammar-feedback is-incorrect"
    : "grammar-feedback";
  grammarPracticeFeedbackEl.textContent = !wasChecked
    ? "Đáp án tham khảo (không tính điểm)."
    : isCorrect
      ? "Chính xác!"
      : "Chưa chính xác. Hãy xem đáp án tham khảo bên dưới.";
  grammarNextQuestionBtn.focus();
}

function checkGrammarAnswer() {
  if (grammarPracticeAnswered) return;
  if (!grammarAnswerEl.value.trim()) {
    grammarPracticeFeedbackEl.className = "grammar-feedback is-incorrect";
    grammarPracticeFeedbackEl.textContent = "Hãy nhập câu trả lời trước khi kiểm tra.";
    grammarAnswerEl.focus();
    return;
  }

  const lesson = getSelectedGrammarLesson();
  const practice = grammarPracticeQuestions[currentGrammarPracticeIndex];
  if (!practice) return;

  const isCorrect = normalizeChineseAnswer(grammarAnswerEl.value)
    === normalizeChineseAnswer(practice.chinese);
  if (isCorrect) {
    grammarPracticeCorrectIds.add(practice);
  } else if (!grammarPracticeMistakes.includes(practice)) {
    grammarPracticeMistakes.push(practice);
  }
  revealGrammarAnswer(isCorrect);
  grammarPracticeScoreEl.textContent =
    `${grammarPracticeCorrectIds.size} / ${lesson.practice.length}`;
}

function advanceGrammarPractice() {
  if (!grammarPracticeAnswered) return;
  currentGrammarPracticeIndex++;
  renderGrammarPracticeQuestion();
}

function goToNextGrammarLesson() {
  const currentLessonIndex = grammarLessons.findIndex(lesson => lesson.id === grammarLessonEl.value);
  const nextLesson = grammarLessons[currentLessonIndex + 1];
  if (!nextLesson) return;

  grammarLevelEl.value = nextLesson.level;
  updateGrammarTopics(nextLesson.topic);
  updateGrammarLessonOptions(nextLesson.id);
  renderGrammarLesson();
}

grammarLevelEl.addEventListener("change", () => {
  updateGrammarTopics();
  renderGrammarLesson();
});
grammarTopicEl.addEventListener("change", () => {
  updateGrammarLessonOptions();
  renderGrammarLesson();
});
grammarLessonEl.addEventListener("change", renderGrammarLesson);
grammarStartPracticeBtn.addEventListener("click", startGrammarPractice);
grammarCheckAnswerBtn.addEventListener("click", checkGrammarAnswer);
grammarAnswerEl.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  checkGrammarAnswer();
});
grammarRevealAnswerBtn.addEventListener("click", () => revealGrammarAnswer(false, false));
grammarNextQuestionBtn.addEventListener("click", advanceGrammarPractice);
grammarRetryPracticeBtn.addEventListener("click", startGrammarPractice);
grammarNextLessonBtn.addEventListener("click", goToNextGrammarLesson);

btnShuffle.addEventListener("click", shuffleWords);

let currentMode = "matching";

const studyScreens = [
  matchingScreen,
  quizScreen,
  listeningScreen,
  questionAnswerScreen,
  typingScreen,
  readingScreen,
  speakingScreen,
  grammarScreen
];
const studyModeButtons = [
  [matchingModeBtn, "matching"],
  [quizModeBtn, "quiz"],
  [typingModeBtn, "typing"],
  [listeningModeBtn, "listening"],
  [questionAnswerModeBtn, "question-answer"],
  [readingModeBtn, "reading"],
  [speakingModeBtn, "speaking"],
  [grammarModeBtn, "grammar"]
];

function setHeaderMenuOpen(isOpen) {
  headerMenuToggle.setAttribute("aria-expanded", String(isOpen));
  headerActions.classList.toggle("is-open", isOpen);
}

headerMenuToggle.addEventListener("click", () => {
  setHeaderMenuOpen(headerMenuToggle.getAttribute("aria-expanded") !== "true");
});

headerActions.addEventListener("click", event => {
  if (event.target.closest("button")) setHeaderMenuOpen(false);
});

document.addEventListener("click", event => {
  if (!headerMenuToggle.contains(event.target) && !headerActions.contains(event.target)) {
    setHeaderMenuOpen(false);
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") setHeaderMenuOpen(false);
});

function setActiveScreen(activeScreen, mode) {
  if (currentMode === "speaking" && mode !== "speaking") stopSpeakingRecording();
  currentMode = mode;
  vocabularyStudyPanel.classList.toggle("hidden", mode === "grammar");
  studyScreens.forEach(screen => screen.classList.toggle("hidden", screen !== activeScreen));
  studyModeButtons.forEach(([button, buttonMode]) => {
    const isActive = buttonMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function showMatchingScreen() {
  setActiveScreen(matchingScreen, "matching");
  startMatching();
}

function showQuizScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length < 4) {
    alert("Bạn cần ít nhất 4 từ vựng trong bộ lọc hiện tại để chuyển sang chế độ Quiz!");
    return;
  }

  setActiveScreen(quizScreen, "quiz");
  startQuiz();
}

function showListeningScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length < 4) {
    alert("Bạn cần ít nhất 4 từ vựng trong bộ lọc hiện tại để luyện nghe!");
    return;
  }

  setActiveScreen(listeningScreen, "listening");
  startListeningPractice();
}

function showQuestionAnswerScreen() {
  if (getFilteredQuestionAnswers().length < 4) {
    alert("Cần ít nhất 4 cặp hỏi đáp trong bộ lọc hiện tại để bắt đầu luyện hỏi đáp!");
    return;
  }

  setActiveScreen(questionAnswerScreen, "question-answer");
  startQuestionAnswerPractice();
}

function showTypingScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length === 0) {
    alert("Không có từ vựng nào trong bộ lọc hiện tại để luyện gõ!");
    return;
  }

  setActiveScreen(typingScreen, "typing");
  startTypingPractice();
}

function showReadingScreen() {
  if (getReadingQuestions(getFilteredWords()).length === 0) {
    alert("Bộ từ hiện tại chưa có câu ví dụ hoặc câu trả lời phù hợp để luyện đọc điền từ!");
    return;
  }

  setActiveScreen(readingScreen, "reading");
  startReadingPractice();
}

function showSpeakingScreen() {
  setActiveScreen(speakingScreen, "speaking");
  startSpeakingPractice();
}

function showGrammarScreen() {
  setActiveScreen(grammarScreen, "grammar");
  renderGrammarLesson();
}

matchingModeBtn.addEventListener("click", showMatchingScreen);
quizModeBtn.addEventListener("click", showQuizScreen);
typingModeBtn.addEventListener("click", showTypingScreen);
listeningModeBtn.addEventListener("click", showListeningScreen);
questionAnswerModeBtn.addEventListener("click", showQuestionAnswerScreen);
readingModeBtn.addEventListener("click", showReadingScreen);
speakingModeBtn.addEventListener("click", showSpeakingScreen);
grammarModeBtn.addEventListener("click", showGrammarScreen);

document.addEventListener("keydown", (event) => {
  const isSpeakShortcut = (event.ctrlKey || event.metaKey)
    && (event.key === "." || event.code === "Period");

  if (isSpeakShortcut) {
    event.preventDefault();

    if (currentMode === "quiz") {
      const currentWord = quizQuestions[currentQuizIndex];
      if (currentWord) speakChinese(currentWord.word);
    } else if (currentMode === "listening") {
      const currentWord = listeningQuestions[currentListeningIndex];
      if (currentWord) {
        speakChinese(listeningContentModeEl.value === "example" ? currentWord.example : currentWord.word);
      }
    } else if (currentMode === "question-answer") {
      const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
      if (currentQuestion) speakChinese(currentQuestion.question);
    } else if (currentMode === "reading") {
      const currentWord = readingQuestions[currentReadingIndex];
      if (currentWord) speakChinese(currentWord.sentence);
    } else if (currentMode === "speaking") {
      const currentWord = speakingQuestions[currentSpeakingIndex];
      if (currentWord) speakChinese(currentWord.example || currentWord.word);
    }

    return;
  }

  if (event.key !== "Enter") return;

  if (currentMode === "typing" && !btnCheckTyping.disabled) {
    event.preventDefault();
    btnCheckTyping.click();
    if (!typingInputEl.disabled) {
      requestAnimationFrame(() => typingInputEl.focus());
    }
    return;
  }

  if (currentMode === "quiz" && currentQuizAnswered && !btnNextQuiz.classList.contains("hidden")) {
    event.preventDefault();
    btnNextQuiz.click();
    return;
  }

  if (currentMode === "listening"
    && document.activeElement === listeningInputEl && !btnCheckListening.disabled) {
    event.preventDefault();
    btnCheckListening.click();
    return;
  }

  if (currentMode === "listening" && listeningAnswered) {
    event.preventDefault();
    btnCheckListening.click();
    if (!listeningInputEl.disabled) {
      requestAnimationFrame(() => listeningInputEl.focus());
    }
  }

  if (currentMode === "question-answer"
    && document.activeElement === questionAnswerInputEl && !btnCheckQuestionAnswer.disabled) {
    event.preventDefault();
    btnCheckQuestionAnswer.click();
    return;
  }

  if (currentMode === "question-answer" && questionAnswerAnswered
    && ["multiple-choice", "chinese-choice"].includes(questionAnswerModeEl.value)) {
    event.preventDefault();
    btnNextQuestionAnswer.click();
    return;
  }

  if (currentMode === "question-answer" && questionAnswerAnswered
    && questionAnswerModeEl.value === "chinese") {
    event.preventDefault();
    btnCheckQuestionAnswer.click();
    return;
  }

  if (currentMode === "reading" && readingAnswered && !btnCheckReading.disabled) {
    event.preventDefault();
    btnCheckReading.click();
    return;
  }

  if (currentMode === "reading" && readingAnswerModeEl.value === "typing"
    && document.activeElement === readingInputEl && !btnCheckReading.disabled) {
    event.preventDefault();
    btnCheckReading.click();
  }
});

async function initApp() {
  try {
    allWords = await loadWords();
    if (allWords.length === 0) {
      throw new Error("Không tìm thấy dữ liệu từ vựng.");
    }

    allQuestionAnswers = loadQuestionAnswers(allWords);
    updateDataSourceOptions();
    updateTopicOptions();
    updateStudyModeAvailability();
    updateSelectedWordCount();
    topicFilterEl.classList.toggle("hidden", studyModeEl.value !== "topic");
    topicFilterLabelEl.classList.toggle("hidden", studyModeEl.value !== "topic");

    try {
      grammarLessons = await loadGrammarLessons();
      if (grammarLessons.length === 0) {
        throw new Error("Không tìm thấy bài ngữ pháp nào.");
      }
      updateGrammarTopics();
      renderGrammarLesson();
    } catch (error) {
      console.error("Không thể tải dữ liệu ngữ pháp:", error);
      grammarErrorEl.textContent =
        "Không thể tải dữ liệu ngữ pháp. Hãy kiểm tra data-grammar.json rồi tải lại trang.";
      grammarErrorEl.classList.remove("hidden");
      grammarLevelEl.disabled = true;
      grammarTopicEl.disabled = true;
      grammarLessonEl.disabled = true;
      grammarStartPracticeBtn.disabled = true;
    }

    showMatchingScreen();
  } catch (error) {
    console.error("Không thể khởi chạy ứng dụng:", error);
    appLoadErrorEl.textContent = "Không thể tải dữ liệu từ vựng. Hãy kiểm tra dữ liệu hoặc kết nối rồi tải lại trang.";
    appLoadErrorEl.classList.remove("hidden");
  }
}

// Khởi chạy ứng dụng lần đầu
initApp();