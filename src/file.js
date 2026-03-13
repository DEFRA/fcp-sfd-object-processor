// src/test-issue.js
function divide (a, b) {
  return a / b // normal code
}

divide(1, undefined) // will produce runtime exception
