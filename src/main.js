const inputArea = document.querySelector(".large-area--input");
const outputArea = document.querySelector(".large-area--output");
const formatButton = document.querySelector(".controls__button--format");
const minifyButton = document.querySelector(".controls__button--minify");

function syntaxHighlight(json) {
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d*)?([eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "number";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "key";
        } else {
          cls = "string";
        }
      } else if (/true|false/.test(match)) {
        cls = "boolean";
      } else if (/null/.test(match)) {
        cls = "null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function smartParseJson(input) {
  let text = input.trim();

  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  const json = JSON.parse(text);

  for (const key of Object.keys(json)) {
    const value = json[key];

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          json[key] = JSON.parse(trimmed);
        } catch {}
      }
    }
  }

  return json;
}

formatButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    const formattedJson = JSON.stringify(json, null, 2);
    outputArea.innerHTML = syntaxHighlight(formattedJson);
  } catch (error) {
    outputArea.textContent = `Invalid JSON!\n${error.message}`;
  }
});

minifyButton.addEventListener("click", () => {
  try {
    const json = smartParseJson(inputArea.value);
    const minifiedJson = JSON.stringify(json);
    outputArea.textContent = minifiedJson;
  } catch (error) {
    outputArea.textContent = `Invalid JSON!\n${error.message}`;
  }
});
