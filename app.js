const DATA_SOURCES = [
  { id: "hsk", label: "Tiếng Trung HSK1-2", file: "./data-hsk.json" }
];

function normalizeWordRecord(item, topic, id) {
  return {
    id,
    topic,
    word: item.word || "Unknown",
    type: String(item.type || "noun").toLowerCase(),
    phonetic: item.phonetic || "",
    meaning: item.meaning || "",
    example: item.example || "",
    examplePhonetic: item.examplePhonetic || "",
    exampleMeaning: item.exampleMeaning || ""
  };
}

function normalizeWordRecords(data) {
  if (!Array.isArray(data)) return [];

  return data.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];

    const topic = item.topic || item.label || "General";
    if (Array.isArray(item.words)) {
      return item.words.flatMap((wordItem, wordIndex) => {
        if (!wordItem || typeof wordItem !== "object") return [];

        const word = wordItem.word || "Unknown";
        return [normalizeWordRecord(wordItem, topic, `${topic}-${wordIndex}-${word}`)];
      });
    }

    if (!item.word) return [];

    const id = item.id || `${topic}-${index}-${item.word}`;
    return [normalizeWordRecord(item, topic, id)];
  });
}

async function loadWords() {
  const loadedSources = await Promise.all(DATA_SOURCES.map(async source => {
    try {
      const response = await fetch(source.file);
      if (!response.ok) {
        throw new Error(`Không đọc được ${source.file}`);
      }

      const records = normalizeWordRecords(await response.json());
      return records.map(record => ({
        ...record,
        sourceId: source.id
      }));
    } catch (error) {
      console.warn(`Không load được ${source.file}:`, error);
      return [];
    }
  }));

  return loadedSources.flat();
}

async function loadQuestionAnswers() {
  try {
    const response = await fetch("./data-hoi-dap.json");
    if (!response.ok) {
      throw new Error("Không đọc được ./data-hoi-dap.json");
    }

    const groups = await response.json();
    if (!Array.isArray(groups)) {
      throw new Error("Dữ liệu hỏi đáp phải là một mảng");
    }

    return groups.flatMap(group => {
      if (!group || typeof group.topic !== "string" || !Array.isArray(group.questions)) return [];

      return group.questions.flatMap((question, index) => {
        if (!question || typeof question !== "object") return [];

        return [{
          ...question,
          id: `${group.topic}-${index}-${question.targetWord || "question"}`,
          topic: group.topic
        }];
      });
    });
  } catch (error) {
    console.warn("Không load được dữ liệu hỏi đáp:", error);
    return [];
  }
}

let allWords = [];
let allQuestionAnswers = [];

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

const selectedWordCountEl = document.getElementById("selected-word-count");
const btnShuffle = document.getElementById("btn-shuffle");
const studyModeEl = document.getElementById("study-mode");
const topicFilterEl = document.getElementById("topic-filter");
const dataSourceEl = document.getElementById("data-source");

// DOM Elements - Matching
const matchingProgressEl = document.getElementById("matching-progress");
const matchingFeedbackEl = document.getElementById("matching-feedback");
const matchingChineseEl = document.getElementById("matching-chinese");
const matchingPinyinEl = document.getElementById("matching-pinyin");
const matchingVietnameseEl = document.getElementById("matching-vietnamese");
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
const questionAnswerQuestionTextEl = document.getElementById("question-answer-question-text");
const questionAnswerQuestionPinyinEl = document.getElementById("question-answer-question-pinyin");
const questionAnswerQuestionMeaningEl = document.getElementById("question-answer-question-meaning");
const questionAnswerModeEl = document.getElementById("question-answer-mode");
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
const readingInputEl = document.getElementById("reading-input");
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
  matchingWords = shuffleList(filteredWords).slice(0, MATCHING_SIZE);
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

  matchingProgressEl.textContent = `${matchingCorrectIds.size} / ${matchingWords.length} cặp đúng`;
  matchingFeedbackEl.textContent = matchingWords.length ? "Chọn một ô ở mỗi cột" : "Không có từ phù hợp";
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

  if (!matchingSelections.word || !matchingSelections.phonetic || !matchingSelections.meaning) return;

  const selectedIds = Object.values(matchingSelections);
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

// --- FILTERS & QUIZ ---
function getAvailableWords() {
  const selectedSource = dataSourceEl.value;
  return selectedSource === "all"
    ? allWords
    : allWords.filter(word => word.sourceId === selectedSource);
}

function getFilteredWords() {
  const mode = studyModeEl.value;
  const selectedTopic = topicFilterEl.value;
  const availableWords = getAvailableWords();

  if (mode === "topic") {
    return selectedTopic === "all"
      ? [...availableWords]
      : availableWords.filter(word => word.topic === selectedTopic);
  }

  if (["noun", "verb", "adjective", "phrase", "number", "pronoun"].includes(mode)) {
    const matchingTypes = getMatchingTypes(mode);
    return availableWords.filter(word =>
      word.type.toLowerCase().split(/\s*\/\s*/).some(type => matchingTypes.includes(type))
    );
  }

  return [...availableWords];
}

function getMatchingTypes(mode) {
  if (mode === "phrase") return ["phrase", "expression"];
  if (mode === "number") return ["number", "numeral"];
  return [mode];
}

function updateStudyModeAvailability() {
  const availableWords = getAvailableWords();
  const categoryModes = ["noun", "verb", "adjective", "phrase", "number", "pronoun"];

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
  quizExampleEl.classList.toggle("quiz-example-hidden", isExamplePractice);
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
}

function formatWordType(type) {
  const labels = {
    adjective: "Tính từ",
    "auxiliary verb": "Trợ động từ",
    adverb: "Phó từ",
    expression: "Cụm từ",
    interjection: "Thán từ",
    noun: "Danh từ",
    number: "Số từ",
    numeral: "Số từ",
    particle: "Trợ từ",
    phrase: "Cụm từ",
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

function speakChinese(text) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.8;
  const chineseVoice = getMandarinVoice();
  if (chineseVoice) utterance.voice = chineseVoice;
  window.speechSynthesis.speak(utterance);
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
  const correctAnswer = isVietnameseAnswer
    ? currentWord.meaning
    : isExampleMode
      ? formatChineseAnswer(currentWord.example, currentWord.examplePhonetic)
      : formatChineseAnswer(currentWord.word, currentWord.phonetic);

  if (isCorrect) {
    listeningCorrectIds.add(currentWord.id);
    listeningScore = listeningCorrectIds.size;
    listeningScoreEl.textContent = listeningScore;
    setFeedback(listeningFeedbackEl, `✅ Đúng! ${correctAnswer}`, true);
  } else {
    if (!listeningRoundMistakes.some(word => word.id === currentWord.id)) {
      listeningRoundMistakes.push(currentWord);
    }
    setFeedback(listeningFeedbackEl, `❌ Sai. Đáp án đúng là: ${correctAnswer}`, false);
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
  const allowedWords = new Set(getFilteredWords().map(word => word.word));
  return allQuestionAnswers.filter(question => allowedWords.has(question.targetWord));
}

function startQuestionAnswerPractice(shouldShuffle = false) {
  const filteredQuestions = getFilteredQuestionAnswers();
  if (filteredQuestions.length < 4) {
    alert("Cần ít nhất 4 cặp hỏi đáp trong bộ lọc hiện tại để bắt đầu luyện hỏi đáp!");
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
      renderRestartButton(questionAnswerOptionsEl, "Làm lại hỏi đáp", () => startQuestionAnswerPractice());
      btnNextQuestionAnswer.classList.add("hidden");
      return;
    }
  }

  const currentQuestion = questionAnswerQuestions[currentQuestionAnswerIndex];
  const isTypingAnswer = questionAnswerModeEl.value === "chinese";
  questionAnswerAnswered = false;
  questionAnswerProgressEl.textContent = questionAnswerIsRetryRound
    ? `Còn sai: ${questionAnswerTotalQuestions - questionAnswerCorrectIds.size} câu`
    : `Câu ${currentQuestionAnswerIndex + 1} / ${questionAnswerQuestions.length}`;
  questionAnswerPromptEl.textContent = isTypingAnswer
    ? "Nghe câu hỏi tiếng Trung rồi gõ câu trả lời bằng tiếng Trung"
    : "Nghe câu hỏi tiếng Trung rồi chọn nghĩa tiếng Việt của câu trả lời";
  questionAnswerOptionsEl.replaceChildren();
  questionAnswerTypingAreaEl.classList.toggle("hidden", !isTypingAnswer);
  questionAnswerOptionsEl.classList.toggle("hidden", isTypingAnswer);
  btnNextQuestionAnswer.classList.add("hidden");
  questionAnswerReviewEl.classList.add("hidden");
  questionAnswerQuestionTextEl.textContent = "";
  questionAnswerQuestionPinyinEl.textContent = "";
  questionAnswerQuestionMeaningEl.textContent = "";
  setFeedback(questionAnswerFeedbackEl, "");

  if (isTypingAnswer) {
    questionAnswerInputEl.value = "";
    questionAnswerInputEl.disabled = false;
    btnCheckQuestionAnswer.disabled = false;
    btnCheckQuestionAnswer.textContent = "Kiểm tra";
    questionAnswerInputEl.focus();
  } else {
    const distractors = [...new Set(getFilteredQuestionAnswers()
      .filter(question => question.id !== currentQuestion.id)
      .map(question => question.answerMeaning)
      .filter(meaning => meaning && meaning !== currentQuestion.answerMeaning))];
    const options = shuffleList([
      ...shuffleList(distractors).slice(0, 3),
      currentQuestion.answerMeaning
    ]);
    options.forEach(answerMeaning => {
      const button = document.createElement("button");
      button.className = "quiz-option-btn";
      button.textContent = answerMeaning;
      button.addEventListener("click", () => selectQuestionAnswer(answerMeaning, button));
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
  questionAnswerQuestionMeaningEl.textContent = currentQuestion.questionMeaning;
  questionAnswerReviewEl.classList.remove("hidden");
  questionAnswerAnswered = true;
  updateQuestionAnswerRetryCount();
}

function selectQuestionAnswer(answerMeaning, selectedButton) {
  if (questionAnswerAnswered) return;

  questionAnswerOptionsEl.querySelectorAll(".quiz-option-btn").forEach(button => {
    button.disabled = true;
    if (button.textContent === questionAnswerQuestions[currentQuestionAnswerIndex].answerMeaning) {
      button.classList.add("correct");
    }
  });

  const isCorrect = answerMeaning === questionAnswerQuestions[currentQuestionAnswerIndex].answerMeaning;
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
questionAnswerModeEl.addEventListener("change", loadQuestionAnswer);

function updateTopicOptions() {
  const availableWords = getAvailableWords();
  const topics = [...new Set(availableWords.map(item => item.topic).filter(Boolean))];
  topicFilterEl.replaceChildren(new Option("Tất cả chủ đề", "all"));

  topics.forEach(topic => {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    topicFilterEl.appendChild(option);
  });
}

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

function getReadingQuestions(words) {
  return words.filter(word => word.example && word.example.includes(word.word));
}

function startReadingPractice(shouldShuffle = false) {
  const filteredWords = getReadingQuestions(getFilteredWords());
  if (filteredWords.length === 0) {
    alert("Bộ từ hiện tại chưa có câu ví dụ phù hợp để luyện đọc điền từ!");
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

  const blankIndex = currentWord.example.indexOf(currentWord.word);
  const readingBlank = document.createElement("span");
  readingBlank.className = "reading-blank";
  readingSentenceEl.replaceChildren(
    document.createTextNode(currentWord.example.slice(0, blankIndex)),
    readingBlank,
    document.createTextNode(currentWord.example.slice(blankIndex + currentWord.word.length))
  );
  readingProgressEl.textContent = readingIsRetryRound
    ? `Còn sai: ${readingTotalQuestions - readingCorrectIds.size} câu`
    : `Câu ${currentReadingIndex + 1} / ${readingQuestions.length}`;
  readingInputEl.value = "";
  readingInputEl.disabled = false;
  btnCheckReading.disabled = false;
  btnCheckReading.textContent = "Kiểm tra";
  setFeedback(readingFeedbackEl, "");
  readingAnswered = false;
  readingInputEl.focus();
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

  const currentWord = readingQuestions[currentReadingIndex];
  if (!currentWord) return;

  const isCorrect = normalizeAnswer(readingInputEl.value) === normalizeAnswer(currentWord.word);
  if (isCorrect) {
    readingCorrectIds.add(currentWord.id);
    readingScore = readingCorrectIds.size;
    readingScoreEl.textContent = readingScore;
    setFeedback(readingFeedbackEl, `✅ Đúng! Đáp án: ${formatChineseAnswer(currentWord.word, currentWord.phonetic)}`, true);
  } else {
    if (!readingRoundMistakes.some(word => word.id === currentWord.id)) {
      readingRoundMistakes.push(currentWord);
    }
    setFeedback(readingFeedbackEl, `❌ Sai. Đáp án đúng là: ${formatChineseAnswer(currentWord.word, currentWord.phonetic)}`, false);
  }

  if (readingPronunciationEnabledEl.checked) {
    speakChinese(currentWord.word);
  }

  readingAnswered = true;
  readingInputEl.disabled = true;
  btnCheckReading.textContent = "Câu tiếp theo ➡";
  if (readingIsRetryRound) {
    readingProgressEl.textContent = `Còn sai: ${readingTotalQuestions - readingCorrectIds.size} câu`;
  }
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
}

async function startSpeakingRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    speakingStatusEl.textContent = "Trình duyệt này chưa hỗ trợ ghi âm. Hãy thử mở app bằng Safari trên iPhone.";
    return;
  }

  clearSpeakingRecording();

  try {
    speakingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      btnNextSpeaking.disabled = false;
    });

    speakingRecorder.start();
    speakingRecordingTimer = setTimeout(stopSpeakingRecording, 25000);
    btnStartSpeakingRecording.disabled = true;
    btnStopSpeakingRecording.disabled = false;
    btnNextSpeaking.disabled = true;
    speakingStatusEl.textContent = "Đang ghi âm… Nói câu tiếng Trung rồi bấm Dừng ghi âm.";
  } catch (error) {
    speakingStream?.getTracks().forEach(track => track.stop());
    speakingStream = null;
    btnStartSpeakingRecording.disabled = false;
    btnStopSpeakingRecording.disabled = true;
    speakingStatusEl.textContent = error.name === "NotAllowedError"
      ? "Chưa được cấp quyền micro. Hãy cho phép Safari sử dụng micro rồi thử lại."
      : "Không mở được micro. Hãy kiểm tra quyền truy cập và thử lại.";
  }
}

function stopSpeakingRecording() {
  clearTimeout(speakingRecordingTimer);
  speakingRecordingTimer = null;
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

  if (mode === "topic") {
    const topics = [...new Set(allWords.map(item => item.topic).filter(Boolean))];
    if (!topics.includes(topicFilterEl.value)) {
      topicFilterEl.value = "all";
    }
  }

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
    startQuestionAnswerPractice();
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

topicFilterEl.addEventListener("change", applyStudyMode);
dataSourceEl.addEventListener("change", () => {
  updateTopicOptions();
  updateStudyModeAvailability();
  applyStudyMode();
});

btnShuffle.addEventListener("click", shuffleWords);

let currentMode = "matching";

const studyScreens = [
  matchingScreen,
  quizScreen,
  listeningScreen,
  questionAnswerScreen,
  typingScreen,
  readingScreen,
  speakingScreen
];
const studyModeButtons = [
  [matchingModeBtn, "matching"],
  [quizModeBtn, "quiz"],
  [typingModeBtn, "typing"],
  [listeningModeBtn, "listening"],
  [questionAnswerModeBtn, "question-answer"],
  [readingModeBtn, "reading"],
  [speakingModeBtn, "speaking"]
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
    alert("Bộ từ hiện tại chưa có câu ví dụ phù hợp để luyện đọc điền từ!");
    return;
  }

  setActiveScreen(readingScreen, "reading");
  startReadingPractice();
}

function showSpeakingScreen() {
  setActiveScreen(speakingScreen, "speaking");
  startSpeakingPractice();
}

matchingModeBtn.addEventListener("click", showMatchingScreen);
quizModeBtn.addEventListener("click", showQuizScreen);
typingModeBtn.addEventListener("click", showTypingScreen);
listeningModeBtn.addEventListener("click", showListeningScreen);
questionAnswerModeBtn.addEventListener("click", showQuestionAnswerScreen);
readingModeBtn.addEventListener("click", showReadingScreen);
speakingModeBtn.addEventListener("click", showSpeakingScreen);

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
      if (currentWord) speakChinese(currentWord.example);
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
    && questionAnswerModeEl.value === "multiple-choice") {
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

  if (currentMode === "reading" && !btnCheckReading.disabled) {
    event.preventDefault();
    btnCheckReading.click();
    if (!readingInputEl.disabled) {
      requestAnimationFrame(() => readingInputEl.focus());
    }
  }
});

async function initApp() {
  [allWords, allQuestionAnswers] = await Promise.all([
    loadWords(),
    loadQuestionAnswers()
  ]);
  updateDataSourceOptions();
  updateTopicOptions();
  updateStudyModeAvailability();
  updateSelectedWordCount();
  topicFilterEl.classList.toggle("hidden", studyModeEl.value !== "topic");
  showMatchingScreen();
}

// Khởi chạy ứng dụng lần đầu
initApp();