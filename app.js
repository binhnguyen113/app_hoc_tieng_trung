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

let allWords = [];

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
const matchingModeBtn = document.getElementById("matching-mode-btn");
const quizModeBtn = document.getElementById("quiz-mode-btn");
const typingModeBtn = document.getElementById("typing-mode-btn");
const listeningModeBtn = document.getElementById("listening-mode-btn");
const readingModeBtn = document.getElementById("reading-mode-btn");
const matchingScreen = document.getElementById("matching-screen");
const quizScreen = document.getElementById("quiz-screen");
const listeningScreen = document.getElementById("listening-screen");
const typingScreen = document.getElementById("typing-screen");
const readingScreen = document.getElementById("reading-screen");

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
const btnNextListening = document.getElementById("btn-next-listening");
const listeningAnswerModeEl = document.getElementById("listening-answer-mode");
const listeningTypingAreaEl = document.getElementById("listening-typing-area");
const listeningInputLabelEl = document.getElementById("listening-input-label");
const listeningInputEl = document.getElementById("listening-input");
const btnCheckListening = document.getElementById("btn-check-listening");
const listeningFeedbackEl = document.getElementById("listening-feedback");
const typingScoreEl = document.getElementById("typing-score");
const typingProgressEl = document.getElementById("typing-progress");
const typingContentModeEl = document.getElementById("typing-content-mode");
const typingDirectionEl = document.getElementById("typing-direction");
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

let listeningQuestions = [];
let currentListeningIndex = 0;
let listeningScore = 0;
let listeningTotalQuestions = 0;
let listeningRoundMistakes = [];
let listeningCorrectIds = new Set();
let listeningIsRetryRound = false;
let listeningAnswered = false;
let listeningShouldShuffle = false;

// --- LOGIC MATCHING ---
const MATCHING_SIZE = 6;
let matchingWords = [];
let matchingSelections = {};
let matchingCorrectIds = new Set();

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

function renderRestartButton(container, label, onClick) {
  const button = document.createElement("button");
  button.className = "btn btn-primary btn-full";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  container.replaceChildren(button);
}

function startMatching() {
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
  document.querySelectorAll(".matching-option.selected").forEach(option => option.classList.add("wrong"));
  setTimeout(() => {
    document.querySelectorAll(".matching-option.wrong").forEach(option => option.classList.remove("selected", "wrong"));
    matchingSelections = {};
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
    const matchingTypes = mode === "number" ? ["number", "numeral"] : [mode];
    return availableWords.filter(word =>
      word.type.toLowerCase().split(/\s*\/\s*/).some(type => matchingTypes.includes(type))
    );
  }

  return [...availableWords];
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
  } else if (currentMode === "reading") {
    startReadingPractice(true);
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
  quizWordTypeEl.textContent = isExamplePractice ? "example" : currentQ.type;
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

  const wrongOptions = shuffleList(quizOptionPool.filter(word => word.id !== currentQ.id)).slice(0, 3);
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
  btnNextListening.classList.remove("hidden");
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
      listeningTypingAreaEl.classList.add("hidden");
      btnNextListening.classList.add("hidden");
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

  const typingAnswerMode = listeningAnswerModeEl.value;
  const isTypingAnswer = typingAnswerMode !== "multiple-choice";
  const isExampleChoice = typingAnswerMode === "multiple-choice";
  listeningPromptEl.textContent = isExampleChoice
    ? "Nghe ví dụ rồi chọn nghĩa của ví dụ"
    : typingAnswerMode === "chinese"
      ? "Nghe từ rồi gõ chữ Hán"
      : "Nghe từ rồi gõ tiếng Việt";
  listeningTypingAreaEl.classList.toggle("hidden", !isTypingAnswer);
  listeningOptionsEl.classList.toggle("hidden", isTypingAnswer);
  btnNextListening.classList.toggle("hidden", isTypingAnswer);

  if (isTypingAnswer) {
    listeningInputLabelEl.textContent = typingAnswerMode === "chinese"
      ? "Gõ chữ Hán vừa nghe"
      : "Gõ nghĩa tiếng Việt vừa nghe";
    listeningInputEl.placeholder = typingAnswerMode === "chinese"
      ? "Nhập chữ Hán..."
      : "Nhập nghĩa tiếng Việt...";
    listeningInputEl.value = "";
    listeningInputEl.disabled = false;
    btnCheckListening.disabled = false;
    btnCheckListening.textContent = "Kiểm tra";
    listeningInputEl.focus();
  }

  if (!isTypingAnswer) {
    const wrongOptions = shuffleList(getFilteredWords().filter(word => word.id !== currentWord.id)).slice(0, 3);
    shuffleList([...wrongOptions, currentWord]).forEach(option => {
      const button = document.createElement("button");
      button.className = "quiz-option-btn";
      button.textContent = getListeningChoiceText(option);
      button.addEventListener("click", () => selectListeningAnswer(option.id, currentWord.id, button));
      listeningOptionsEl.appendChild(button);
    });
  }

  speakChinese(isExampleChoice ? currentWord.example : currentWord.word);
}

function updateListeningRetryCount() {
  if (!listeningIsRetryRound) return;

  const remainingQuestions = listeningTotalQuestions - listeningCorrectIds.size;
  listeningProgressEl.textContent = `Còn sai: ${remainingQuestions} câu`;
}

function selectListeningAnswer(selectedId, correctId, selectedButton) {
  if (listeningAnswered) return;

  listeningAnswered = true;
  const optionButtons = listeningOptionsEl.querySelectorAll(".quiz-option-btn");
  optionButtons.forEach(button => button.disabled = true);

  if (selectedId === correctId) {
    selectedButton.classList.add("correct");
    listeningCorrectIds.add(correctId);
    listeningScore = listeningCorrectIds.size;
    listeningScoreEl.textContent = listeningScore;
  } else {
    selectedButton.classList.add("wrong");
    const missedWord = listeningQuestions.find(word => word.id === correctId);
    const meaning = missedWord
      ? (listeningAnswerModeEl.value === "multiple-choice"
        ? missedWord.exampleMeaning || missedWord.meaning
        : missedWord.meaning)
      : "";
    setFeedback(listeningFeedbackEl, `❌ Sai. Nghĩa tiếng Việt: ${meaning}`, false);
    if (missedWord && !listeningRoundMistakes.some(word => word.id === correctId)) {
      listeningRoundMistakes.push(missedWord);
    }
    optionButtons.forEach(button => {
      if (missedWord && button.textContent === getListeningChoiceText(missedWord)) {
        button.classList.add("correct");
      }
    });
  }

  updateListeningRetryCount();
  btnNextListening.classList.remove("hidden");
}

function getListeningChoiceText(word) {
  return word.exampleMeaning || word.meaning;
}

btnCheckListening.addEventListener("click", () => {
  if (listeningAnswered) {
    advanceListeningQuestion();
    return;
  }

  const currentWord = listeningQuestions[currentListeningIndex];
  if (!currentWord) return;

  const isChineseAnswer = listeningAnswerModeEl.value === "chinese";
  const correctValues = (isChineseAnswer ? currentWord.word : currentWord.meaning)
    .split(",")
    .map(normalizeAnswer);
  const inputValue = normalizeAnswer(listeningInputEl.value);
  const isCorrect = correctValues.includes(inputValue);
  const correctAnswer = `${currentWord.word}${currentWord.phonetic ? ` (${currentWord.phonetic})` : ""}`;

  if (isCorrect) {
    listeningCorrectIds.add(currentWord.id);
    listeningScore = listeningCorrectIds.size;
    listeningScoreEl.textContent = listeningScore;
    setFeedback(listeningFeedbackEl, `✅ Đúng! ${correctAnswer}`, true);
  } else {
    if (!listeningRoundMistakes.some(word => word.id === currentWord.id)) {
      listeningRoundMistakes.push(currentWord);
    }
    const correction = isChineseAnswer
      ? `Đáp án đúng là: ${formatChineseAnswer(currentWord.word, currentWord.phonetic)}`
      : `Nghĩa tiếng Việt: ${currentWord.meaning}`;
    setFeedback(listeningFeedbackEl, `❌ Sai. ${correction}`, false);
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

  const isExampleChoice = listeningAnswerModeEl.value === "multiple-choice";
  speakChinese(isExampleChoice ? currentWord.example : currentWord.word);
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

btnNextListening.addEventListener("click", advanceListeningQuestion);

listeningAnswerModeEl.addEventListener("change", () => {
  listeningAnswered = false;
  loadListeningQuestion();
});

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
  const chineseToVietnamese = typingDirectionEl.value === "chinese-to-vietnamese";
  const isExampleMode = typingContentModeEl.value === "example";
  const chineseText = isExampleMode ? currentWord.example : currentWord.word;
  const vietnameseText = isExampleMode
    ? (currentWord.exampleMeaning || currentWord.meaning)
    : currentWord.meaning;
  const chinesePhonetic = isExampleMode ? currentWord.examplePhonetic : currentWord.phonetic;

  typingPromptEl.textContent = chineseToVietnamese
    ? (isExampleMode ? "Example tiếng Trung" : "Từ tiếng Trung")
    : (isExampleMode ? "Nghĩa tiếng Việt của example" : "Nghĩa tiếng Việt");
  typingInputLabelEl.textContent = chineseToVietnamese
    ? "Gõ nghĩa tiếng Việt"
    : (isExampleMode ? "Gõ example tiếng Trung" : "Gõ từ tiếng Trung");
  typingWordEl.textContent = chineseToVietnamese ? chineseText : vietnameseText;
  typingPhoneticEl.textContent = chineseToVietnamese ? (chinesePhonetic || "") : "";
  typingInputEl.placeholder = chineseToVietnamese
    ? (isExampleMode ? "Nhập nghĩa tiếng Việt của example..." : "Nhập nghĩa tiếng Việt...")
    : (isExampleMode ? "Nhập example tiếng Trung..." : "Nhập từ tiếng Trung...");
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
  const chineseToVietnamese = typingDirectionEl.value === "chinese-to-vietnamese";
  const isExampleMode = typingContentModeEl.value === "example";
  const chineseText = isExampleMode ? currentWord.example : currentWord.word;
  const vietnameseText = isExampleMode
    ? (currentWord.exampleMeaning || currentWord.meaning)
    : currentWord.meaning;
  const phoneticText = isExampleMode ? currentWord.examplePhonetic : currentWord.phonetic;
  const correctValues = (chineseToVietnamese ? vietnameseText : chineseText)
    .split(",")
    .map(normalizeAnswer);
  const inputValue = normalizeAnswer(typingInputEl.value);

  if (correctValues.includes(inputValue)) {
    typingCorrectIds.add(currentWord.id);
    typingScore = typingCorrectIds.size;
    typingScoreEl.textContent = typingScore;
    setFeedback(typingFeedbackEl, `✅ Đúng! Đáp án: ${formatChineseAnswer(chineseText, phoneticText)}`, true);
  } else {
    if (!typingRoundMistakes.some(word => word.id === currentWord.id)) {
      typingRoundMistakes.push(currentWord);
    }
    const correction = chineseToVietnamese
      ? `Nghĩa tiếng Việt: ${vietnameseText}`
      : `Đáp án đúng là: ${formatChineseAnswer(chineseText, phoneticText)}`;
    setFeedback(typingFeedbackEl, `❌ Sai. ${correction}`, false);
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
typingDirectionEl.addEventListener("change", () => startTypingPractice());

let readingQuestions = [];
let currentReadingIndex = 0;
let readingScore = 0;
let readingTotalQuestions = 0;
let readingRoundMistakes = [];
let readingCorrectIds = new Set();
let readingIsRetryRound = false;
let readingAnswered = false;
let readingShouldShuffle = false;

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

  if (currentMode === "typing") {
    startTypingPractice();
    return;
  }

  if (currentMode === "reading") {
    startReadingPractice();
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
  applyStudyMode();
});

btnShuffle.addEventListener("click", shuffleWords);

let currentMode = "quiz";

const studyScreens = [matchingScreen, quizScreen, listeningScreen, typingScreen, readingScreen];
const studyModeButtons = [
  [matchingModeBtn, "matching"],
  [quizModeBtn, "quiz"],
  [typingModeBtn, "typing"],
  [listeningModeBtn, "listening"],
  [readingModeBtn, "reading"]
];

function setActiveScreen(activeScreen, mode) {
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
  setActiveScreen(readingScreen, "reading");
  startReadingPractice();
}

matchingModeBtn.addEventListener("click", showMatchingScreen);
quizModeBtn.addEventListener("click", showQuizScreen);
typingModeBtn.addEventListener("click", showTypingScreen);
listeningModeBtn.addEventListener("click", showListeningScreen);
readingModeBtn.addEventListener("click", showReadingScreen);

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
      if (currentWord) speakChinese(currentWord.word);
    } else if (currentMode === "typing") {
      const currentWord = typingQuestions[currentTypingIndex];
      if (currentWord) {
        const typingText = typingContentModeEl.value === "example"
          ? currentWord.example
          : currentWord.word;
        speakChinese(typingText);
      }
    } else if (currentMode === "reading") {
      const currentWord = readingQuestions[currentReadingIndex];
      if (currentWord) speakChinese(currentWord.example);
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

  if (currentMode === "listening" && listeningAnswerModeEl.value !== "multiple-choice"
    && document.activeElement === listeningInputEl && !btnCheckListening.disabled) {
    event.preventDefault();
    btnCheckListening.click();
    return;
  }

  if (currentMode === "listening" && listeningAnswered) {
    event.preventDefault();
    if (listeningAnswerModeEl.value === "multiple-choice") {
      btnNextListening.click();
    } else {
      btnCheckListening.click();
      if (!listeningInputEl.disabled) {
        requestAnimationFrame(() => listeningInputEl.focus());
      }
    }
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
  allWords = await loadWords();
  updateDataSourceOptions();
  updateTopicOptions();
  updateSelectedWordCount();
  topicFilterEl.classList.toggle("hidden", studyModeEl.value !== "topic");
  startQuiz();
}

// Khởi chạy ứng dụng lần đầu
initApp();