// Настройки приложения «Счёт 108».
//
// firebase: null  → всё хранится на этом телефоне, работает без интернета.
// firebase: {...} → общие столы для всей компании через Firebase (инструкция в README.md).
//
// Веб-конфиг Firebase не секретный, его можно хранить в публичном репозитории.
// Ключ Anthropic API сюда НЕ вписывайте — он вводится в настройках приложения на телефоне.
window.SCHET108_CONFIG = {
  server: true,   // общие столы через сервер на Render (false → только этот телефон)
  firebase: null,
  // Пример:
  // firebase: {
  //   apiKey: "AIza...",
  //   authDomain: "schet108.firebaseapp.com",
  //   projectId: "schet108",
  //   appId: "1:000000000000:web:0000000000000000"
  // },

  // Модель для фото-подсчёта карт
  visionModel: "claude-sonnet-5-5"
};
