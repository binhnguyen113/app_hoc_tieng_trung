const DATA_SOURCES = [
  { id: "topic", label: "Tiếng Trung chủ đề", file: "./data-topic.json" },
  { id: "hsk", label: "Tiếng Trung HSK1-2", file: "./data-hsk.json" },
  { id: "bothu", label: "Bộ thủ", file: "./data-bothu.json" }

];

function normalizeWordRecords(data) {
  if (!Array.isArray(data)) return [];

  const flatRecords = [];

  data.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;

    const topicName = item.topic || item.label || 'General';

    if (Array.isArray(item.words)) {
      item.words.forEach((wordItem, wordIndex) => {
        if (!wordItem || typeof wordItem !== 'object') return;

        const word = wordItem.word || 'Unknown';
        flatRecords.push({
          id: `${topicName}-${wordIndex}-${word}`,
          topic: topicName,
          word,
          type: String(wordItem.type || 'noun').toLowerCase(),
          phonetic: wordItem.phonetic || '',
          meaning: wordItem.meaning || '',
          example: wordItem.example || '',
          examplePhonetic: wordItem.examplePhonetic || ''
        });
      });
      return;
    }

    if (item.word) {
      const word = item.word || 'Unknown';
      flatRecords.push({
        id: item.id || `${topicName}-${index}-${word}`,
        topic: topicName,
        word,
        type: String(item.type || 'noun').toLowerCase(),
        phonetic: item.phonetic || '',
        meaning: item.meaning || '',
        example: item.example || '',
        examplePhonetic: item.examplePhonetic || ''
      });
    }
  });

  return flatRecords;
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
        sourceId: source.id,
        sourceLabel: source.label
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

// DOM Elements - Common
const btnToggleMode = document.getElementById("btn-toggle-mode");
const typingModeBtn = document.getElementById("typing-mode-btn");
const listeningModeBtn = document.getElementById("listening-mode-btn");
const matchingScreen = document.getElementById("matching-screen");
const quizScreen = document.getElementById("quiz-screen");
const listeningScreen = document.getElementById("listening-screen");
const typingScreen = document.getElementById("typing-screen");

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
const listeningScoreEl = document.getElementById("listening-score");
const listeningProgressEl = document.getElementById("listening-progress");
const listeningOptionsEl = document.getElementById("listening-options");
const btnReplayListening = document.getElementById("btn-replay-listening");
const btnNextListening = document.getElementById("btn-next-listening");
const typingScoreEl = document.getElementById("typing-score");
const typingProgressEl = document.getElementById("typing-progress");
const typingDirectionEl = document.getElementById("typing-direction");
const typingPromptEl = document.getElementById("typing-prompt");
const typingWordEl = document.getElementById("typing-word");
const typingPhoneticEl = document.getElementById("typing-phonetic");
const typingInputEl = document.getElementById("typing-input");
const btnCheckTyping = document.getElementById("btn-check-typing");
const typingFeedbackEl = document.getElementById("typing-feedback");

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
  return [...list].sort(() => Math.random() - 0.5);
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
    container.innerHTML = "";
    shuffleList(matchingWords).forEach(word => {
      const button = document.createElement("button");
      button.className = "matching-option";
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
    return availableWords.filter(word => word.type.toLowerCase() === mode);
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
  } else {
    startTypingPractice(true);
  }
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
      quizOptionsEl.innerHTML = `<button class="btn btn-primary btn-full" onclick="startQuiz()">Làm lại Quiz</button>`;
      btnNextQuiz.classList.add("hidden");
      return;
    }
  }

  const currentQ = quizQuestions[currentQuizIndex];
  currentQuizAnswered = false;
  quizWordEl.textContent = currentQ.word;
  quizWordTypeEl.textContent = currentQ.type;
  quizPhoneticEl.textContent = currentQ.phonetic || "";
  quizExampleEl.innerHTML = currentQ.example
    ? `Ví dụ: "${currentQ.example}"${currentQ.examplePhonetic ? `<br><span class="example-pinyin">${currentQ.examplePhonetic}</span>` : ""}`
    : "";
  quizProgressEl.textContent = quizIsRetryRound
    ? `Còn sai: ${quizTotalQuestions - quizCorrectIds.size} câu`
    : `Câu ${currentQuizIndex + 1} / ${quizQuestions.length}`;

  const wrongOptions = quizOptionPool
    .filter(w => w.id !== currentQ.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const options = [...wrongOptions, currentQ].sort(() => Math.random() - 0.5);

  // Render các nút đáp án
  quizOptionsEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "quiz-option-btn";
    btn.textContent = opt.meaning;
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
    allBtns.forEach(btn => {
      const matchedOpt = quizOptionPool.find(w => w.id === correctId);
      if (matchedOpt && btn.textContent === matchedOpt.meaning) {
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
  speakChinese(quizQuestions[currentQuizIndex].word);
});

function speakChinese(text) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
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
      listeningOptionsEl.innerHTML = `<button class="btn btn-primary btn-full" onclick="startListeningPractice()">Làm lại luyện nghe</button>`;
      btnNextListening.classList.add("hidden");
      return;
    }
  }

  const currentWord = listeningQuestions[currentListeningIndex];
  listeningAnswered = false;
  listeningProgressEl.textContent = listeningIsRetryRound
    ? `Còn sai: ${listeningTotalQuestions - listeningCorrectIds.size} câu`
    : `Câu ${currentListeningIndex + 1} / ${listeningQuestions.length}`;
  listeningOptionsEl.innerHTML = "";

  const wrongOptions = getFilteredWords()
    .filter(word => word.id !== currentWord.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  shuffleList([...wrongOptions, currentWord]).forEach(option => {
    const button = document.createElement("button");
    button.className = "quiz-option-btn";
    button.textContent = option.meaning;
    button.addEventListener("click", () => selectListeningAnswer(option.id, currentWord.id, button));
    listeningOptionsEl.appendChild(button);
  });

  speakChinese(currentWord.word);
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
    if (missedWord && !listeningRoundMistakes.some(word => word.id === correctId)) {
      listeningRoundMistakes.push(missedWord);
    }
    optionButtons.forEach(button => {
      if (button.textContent === missedWord?.meaning) button.classList.add("correct");
    });
  }

  updateListeningRetryCount();
  btnNextListening.classList.remove("hidden");
}

btnReplayListening.addEventListener("click", () => {
  const currentWord = listeningQuestions[currentListeningIndex];
  if (currentWord) speakChinese(currentWord.word);
});

btnNextListening.addEventListener("click", () => {
  if (!listeningAnswered) {
    const skippedWord = listeningQuestions[currentListeningIndex];
    if (skippedWord && !listeningRoundMistakes.some(word => word.id === skippedWord.id)) {
      listeningRoundMistakes.push(skippedWord);
    }
  }

  currentListeningIndex++;
  loadListeningQuestion();
});

function updateTopicOptions() {
  const availableWords = getAvailableWords();
  const topics = [...new Set(availableWords.map(item => item.topic).filter(Boolean))];
  topicFilterEl.innerHTML = '<option value="all">Tất cả chủ đề</option>';

  topics.forEach(topic => {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    topicFilterEl.appendChild(option);
  });
}

function updateDataSourceOptions() {
  dataSourceEl.innerHTML = '<option value="all">Tất cả bộ từ</option>';

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
  typingFeedbackEl.textContent = "";
  typingFeedbackEl.style.color = "";
  typingInputEl.value = "";
  renderTypingQuestion();
}

function renderTypingQuestion() {
  typingInputEl.value = "";
  typingInputEl.focus();

  const currentWord = typingQuestions[currentTypingIndex];
  const chineseToVietnamese = typingDirectionEl.value === "chinese-to-vietnamese";
  typingPromptEl.textContent = chineseToVietnamese ? "Từ tiếng Trung" : "Nghĩa tiếng Việt";
  typingWordEl.textContent = chineseToVietnamese ? currentWord.word : currentWord.meaning;
  typingPhoneticEl.textContent = chineseToVietnamese ? (currentWord.phonetic || "") : "";
  typingInputEl.placeholder = chineseToVietnamese
    ? "Nhập nghĩa tiếng Việt..."
    : "Nhập chữ Hán...";
  typingProgressEl.textContent = typingIsRetryRound
    ? `Còn sai: ${typingTotalQuestions - typingCorrectIds.size} câu`
    : `Câu ${currentTypingIndex + 1} / ${typingQuestions.length}`;
  typingInputEl.disabled = false;
  btnCheckTyping.disabled = false;
  btnCheckTyping.textContent = "Kiểm tra";
  typingAnswered = false;
  typingFeedbackEl.textContent = "";
}

function updateTypingRetryCount() {
  if (!typingIsRetryRound) return;

  const remainingQuestions = typingTotalQuestions - typingCorrectIds.size;
  typingProgressEl.textContent = `Còn sai: ${remainingQuestions} câu`;
}

function normalizeTypingAnswer(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

btnCheckTyping.addEventListener("click", () => {
  if (typingAnswered) {
    advanceTypingQuestion();
    return;
  }

  if (currentTypingIndex >= typingQuestions.length) return;

  const currentWord = typingQuestions[currentTypingIndex];
  const chineseToVietnamese = typingDirectionEl.value === "chinese-to-vietnamese";
  const inputValue = normalizeTypingAnswer(typingInputEl.value);
  const correctValues = (chineseToVietnamese ? currentWord.meaning : currentWord.word)
    .split(",")
    .map(normalizeTypingAnswer);

  if (correctValues.includes(inputValue)) {
    typingCorrectIds.add(currentWord.id);
    typingScore = typingCorrectIds.size;
    typingScoreEl.textContent = typingScore;
    typingFeedbackEl.textContent = "✅ Đúng!";
    typingFeedbackEl.style.color = "#065f46";
  } else {
    if (!typingRoundMistakes.some(word => word.id === currentWord.id)) {
      typingRoundMistakes.push(currentWord);
    }
    const correctAnswer = chineseToVietnamese
      ? currentWord.meaning
      : `${currentWord.word}${currentWord.phonetic ? ` (${currentWord.phonetic})` : ""}`;
    typingFeedbackEl.textContent = `❌ Sai. Đáp án đúng là: ${correctAnswer}`;
    typingFeedbackEl.style.color = "#991b1b";
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
      typingFeedbackEl.textContent = "Bạn có thể bấm Xáo trộn để ôn lại theo thứ tự mới.";
      typingFeedbackEl.style.color = "#065f46";
      typingInputEl.value = "";
      typingInputEl.disabled = true;
      btnCheckTyping.disabled = true;
      btnCheckTyping.textContent = "Hoàn thành";
      return;
    }
  }

  renderTypingQuestion();
}

typingDirectionEl.addEventListener("change", startTypingPractice);

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

function showMatchingScreen() {
  currentMode = "matching";
  matchingScreen.classList.remove("hidden");
  quizScreen.classList.add("hidden");
  listeningScreen.classList.add("hidden");
  typingScreen.classList.add("hidden");
  btnToggleMode.textContent = "🎮 Làm Quiz";
  startMatching();
}

function showQuizScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length < 4) {
    alert("Bạn cần ít nhất 4 từ vựng trong bộ lọc hiện tại để chuyển sang chế độ Quiz!");
    return;
  }

  currentMode = "quiz";
  matchingScreen.classList.add("hidden");
  quizScreen.classList.remove("hidden");
  listeningScreen.classList.add("hidden");
  typingScreen.classList.add("hidden");
  btnToggleMode.textContent = "📖 Về nối từ";
  startQuiz();
}

function showListeningScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length < 4) {
    alert("Bạn cần ít nhất 4 từ vựng trong bộ lọc hiện tại để luyện nghe!");
    return;
  }

  currentMode = "listening";
  matchingScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  listeningScreen.classList.remove("hidden");
  typingScreen.classList.add("hidden");
  btnToggleMode.textContent = "📖 Về nối từ";
  startListeningPractice();
}

function showTypingScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length === 0) {
    alert("Không có từ vựng nào trong bộ lọc hiện tại để luyện gõ!");
    return;
  }

  currentMode = "typing";
  matchingScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  listeningScreen.classList.add("hidden");
  typingScreen.classList.remove("hidden");
  btnToggleMode.textContent = "📖 Về nối từ";
  startTypingPractice();
}

btnToggleMode.addEventListener("click", () => {
  if (currentMode === "matching") {
    showQuizScreen();
    return;
  }

  showMatchingScreen();
});

typingModeBtn.addEventListener("click", () => {
  if (currentMode === "typing") {
    showMatchingScreen();
    return;
  }

  showTypingScreen();
});

listeningModeBtn.addEventListener("click", () => {
  if (currentMode === "listening") {
    showMatchingScreen();
    return;
  }

  showListeningScreen();
});

typingInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !btnCheckTyping.disabled) {
    event.preventDefault();
    btnCheckTyping.click();
  }
});

async function initApp() {
  allWords = await loadWords();
  updateDataSourceOptions();
  updateTopicOptions();
  updateSelectedWordCount();
  topicFilterEl.classList.toggle("hidden", studyModeEl.value !== "topic");
  btnToggleMode.textContent = "📖 Về nối từ";
  startQuiz();
}

// Khởi chạy ứng dụng lần đầu
initApp();