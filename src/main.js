const inputArea = document.querySelector(".large-area--input");
const outputArea = document.querySelector(".large-area--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");

formatButton.addEventListener("click", () => {
  try {
    const json = JSON.parse(inputArea.value);
    const formattedJson = JSON.stringify(json, null, 2);
    outputArea.value = formattedJson;
  } catch (error) {
    outputArea.value = "Invalid JSON";
  }
});

minifyButton.addEventListener("click", () => {
  try {
    const json = JSON.parse(inputArea.value);
    const minifiedJson = JSON.stringify(json);
    outputArea.value = minifiedJson;
  } catch (error) {
    outputArea.value = "Invalid JSON";
  }
});
