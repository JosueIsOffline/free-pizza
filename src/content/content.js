import browser from "webextension-polyfill";
import { deepHtmlSearch, deepHtmlFindByTextContent } from "./domHelper";

let isSuspendRunning = false;
let isInitiated = false;
const components = [];
let questions = [];
const componentUrls = [];
let iteration = 0;
let checkInterval = null;

browser.runtime.onMessage.addListener(async (request) => {
  if (
    request?.componentsUrl &&
    typeof request.componentsUrl === "string" &&
    !componentUrls.includes(request.componentsUrl)
  ) {
    componentUrls.push(request.componentsUrl);
    await setComponents(request.componentsUrl);
    suspendMain();
  }
});

const setComponents = async (url) => {
  const getTextContentOfText = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    return doc.body.textContent;
  };

  try {
    const res = await fetch(url);

    if (!res.ok) return;

    let json = await res.json();
    json = json
      .filter((component) => component._items)
      .filter(
        (component) => !components.map((c) => c._id).includes(component._id),
      )
      .map((component) => {
        component.body = getTextContentOfText(component.body);
        return component;
      });

    components.push(...json);
  } catch (e) {
    console.error(e);
  }
};

const setQuestionSections = async () => {
  let isAtLeaseOneSet = false;

  for (const component of components) {
    const questionDiv = deepHtmlSearch(
      document,
      `.${CSS.escape(component._id)}`,
    );

    if (questionDiv) {
      isAtLeaseOneSet = true;
      let questionType = "basic";

      if (component._items[0].text && component._items[0]._options) {
        questionType = "dropdownSelect";
      } else if (component._items[0].question && component._items[0].answer) {
        questionType = "match";
      } else if (
        component._items[0]._graphic?.alt &&
        component._items[0]._graphic?.src
      ) {
        questionType = "yesNo";
      } else if (component._items[0].id && component._items[0]._options?.text) {
        questionType = "openTextInput";
      } else if (
        component._items[0].preText &&
        component._items[0].postText &&
        component._items[0]._options?.[0]?.text
      ) {
        questionType = "fillBlanks";
      } else if (
        component._items[0]._options?.[0].text &&
        typeof component._items[0]._options?.[0]._isCorrect === "boolean"
      ) {
        questionType = "tableDropdown";
      }

      questions.push({
        questionDiv,
        id: component._id,
        answersLength: component._items.length,
        questionType,
        items: component._items,
      });
    }
  }

  if (!isAtLeaseOneSet) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await setQuestionSections();
  }
};

const findQuestionElement = (document) => {
  for (const component of components) {
    const questionElement = deepHtmlFindByTextContent(document, component.body);

    if (questionElement) {
      return questionElement;
    }
  }
};

const findAnswerInputsBasic = (
  document,
  questionId,
  answersLength,
  inputs = [],
) => {
  for (let i = 0; i < answersLength; i++) {
    const input = deepHtmlSearch(
      document,
      `#${CSS.escape(questionId)}-${i}-input`,
    );
    const label = deepHtmlSearch(
      document,
      `#${CSS.escape(questionId)}-${i}-label`,
    );

    if (input) {
      inputs.push({ input, label });

      if (inputs.length === answersLength) {
        return inputs;
      }
    }
  }
};

const findAnswerInputsMatch = (document, answersLength, buttons = []) => {
  for (let i = 0; i < answersLength; i++) {
    const answerInputs = deepHtmlSearch(document, `[data-id="${i}"]`, false, 2);

    if (answerInputs) {
      buttons.push(answerInputs);

      if (buttons.length === answersLength) {
        return buttons;
      }
    }
  }
};

const setQuestionElements = () => {
  questions.map((question) => {
    if (question.questionType === "basic") {
      question.questionElement = findQuestionElement(question.questionDiv);
      question.inputs =
        findAnswerInputsBasic(
          question.questionDiv,
          question.id,
          question.answersLength,
        ) || [];
    } else if (question.questionType === "match") {
      question.questionElement = findQuestionElement(question.questionDiv);
      question.inputs =
        findAnswerInputsMatch(question.questionDiv, question.answersLength) ||
        [];
    } else if (question.questionType === "dropdownSelect") {
      setDropdownSelectQuestions(question);
      question.skip = true;
    } else if (question.questionType === "yesNo") {
      initYeNoQuestions(question);
      question.skip = true;
    } else if (question.questionType === "openTextInput") {
      setOpenTextInputQuestions(question);
      question.skip = true;
    } else if (question.questionType === "fillBlanks") {
      setFillBlanksQuestions(question);
      question.skip = true;
    } else if (question.questionType === "tableDropdown") {
      setTableDropdownQuestions(question);
      question.skip = true;
    }

    return question;
  });
};

const setDropdownSelectQuestions = (question) => {
  question.items.forEach((item, i) => {
    const questionDiv = deepHtmlSearch(
      question.questionDiv,
      `[index="${i}"]`,
      true,
    );
    const questionElement = deepHtmlFindByTextContent(
      questionDiv,
      item.text.trim(),
    );

    for (const [index, option] of item._options.entries()) {
      if (option._isCorrect) {
        const optionElement = deepHtmlSearch(
          questionDiv,
          `#dropdown__item-index-${index}`,
          true,
        );

        questions.push({
          questionDiv,
          questionElement,
          inputs: [optionElement],
          questionType: question.questionType,
        });
        return;
      }
    }
  });
};

const initYeNoQuestions = (question) => {
  const currentIteration = iteration;
  const questionElement = deepHtmlSearch(question.questionDiv, `.img_question`);

  if (!questionElement) return;

  questionElement.parentElement?.addEventListener("click", (e) => {
    if (currentIteration !== iteration) return;

    const questionElement = deepHtmlSearch(e.target, `.img_question`);

    for (const item of question.items) {
      if (questionElement.alt === item._graphic.alt) {
        if (item._shouldBeSelected) {
          const yesButton = deepHtmlSearch(
            question.questionDiv,
            `.user_selects_yes`,
          );
          yesButton.click();
        } else {
          const noButton = deepHtmlSearch(
            question.questionDiv,
            `.user_selects_no`,
          );
          noButton.click();
        }
      }
    }
  });

  const yesButton = deepHtmlSearch(question.questionDiv, `.user_selects_yes`);
  const noButton = deepHtmlSearch(question.questionDiv, `.user_selects_no`);

  yesButton?.addEventListener("mouseover", (e) => {
    if (currentIteration !== iteration) return;
    if (e.ctrlKey) {
      const questionElement = deepHtmlSearch(
        question.questionDiv,
        `.img_question`,
      );

      if (questionElement) {
        for (const item of question.items) {
          if (item._graphic.alt === questionElement.alt) {
            if (item._shouldBeSelected) {
              yesButton.click();
            }
            break;
          }
        }
      }
    }
  });

  noButton?.addEventListener("mouseover", (e) => {
    if (currentIteration !== iteration) return;
    if (e.ctrlKey) {
      const questionElement = deepHtmlSearch(
        question.questionDiv,
        `.img_question`,
      );

      if (questionElement) {
        for (const item of question.items) {
          if (item._graphic.alt === questionElement.alt) {
            if (!item._shouldBeSelected) {
              noButton.click();
            }
            break;
          }
        }
      }
    }
  });
};

const setOpenTextInputQuestions = (question) => {
  const currentIteration = iteration;

  question.items.forEach((item, i) => {
    const questionElement = deepHtmlSearch(
      question.questionDiv,
      "#" + CSS.escape(`${question.id}-option-${i}`),
    );
    const button = deepHtmlSearch(
      question.questionDiv,
      `.current-item-${i}`,
      true,
    );

    questionElement?.addEventListener("click", () => {
      if (currentIteration !== iteration) return;

      setTimeout(() => {
        button.click();
        const currentQuestion = questionElement?.textContent?.trim();
        const position = question.items.find(
          (item) => item._options.text.trim() === currentQuestion,
        )?.position?.[0];

        if (position) {
          setTimeout(() => {
            const input = deepHtmlSearch(
              question.questionDiv,
              `[data-target="${position}"]`,
            );
            if (input) {
              input?.click();
            } else {
              question.questionDiv.click();
            }
          }, 100);
        }
      }, 100);
    });

    button?.addEventListener("click", () => {
      if (currentIteration !== iteration) return;

      setTimeout(() => {
        const currentQuestion = questionElement?.textContent?.trim();
        const position = question.items.find(
          (item) => item._options.text.trim() === currentQuestion,
        )?.position?.[0];

        if (position) {
          setTimeout(() => {
            const input = deepHtmlSearch(
              question.questionDiv,
              `[data-target="${position}"]`,
            );

            input?.addEventListener("mouseover", (e) => {
              if (currentIteration !== iteration) return;
              if (e.ctrlKey) {
                input.click();
              }
            });
          }, 100);
        }
      }, 100);
    });
  });
};

const setFillBlanksQuestions = (question) => {
  const currentIteration = iteration;
  const questionDivs = [
    ...deepHtmlSearch(
      question.questionDiv,
      ".fillblanks__item",
      true,
      question.answersLength,
    ),
  ];

  if (questionDivs.length > 0) {
    questionDivs.forEach((questionDiv) => {
      const textContent = questionDiv.textContent.trim();

      for (const item of question.items) {
        if (
          textContent.startsWith(removeTagsFromString(item.preText)) &&
          textContent.endsWith(removeTagsFromString(item.postText))
        ) {
          for (const option of item._options) {
            if (option._isCorrect) {
              const dropdownItems = [
                ...deepHtmlSearch(
                  questionDiv,
                  ".dropdown__item",
                  true,
                  item._options.length,
                ),
              ];

              for (const dropdownItem of dropdownItems) {
                if (dropdownItem.textContent.trim() === option.text.trim()) {
                  questionDiv.addEventListener("click", (e) => {
                    if (currentIteration !== iteration) return;
                    if (!e.target.textContent?.trim()) return;
                    dropdownItem.click();
                  });

                  dropdownItem.addEventListener("mouseover", (e) => {
                    if (currentIteration !== iteration) return;
                    if (e.ctrlKey) dropdownItem.click();
                  });
                  break;
                }
              }
              break;
            }
          }
          break;
        }
      }
    });
  }
};

const setTableDropdownQuestions = (question) => {
  const currentIteration = iteration;
  const sectionDivs = Array.from(
    deepHtmlSearch(
      question.questionDiv,
      "tbody tr",
      true,
      question.answersLength,
    ),
  );

  sectionDivs.forEach((section, i) => {
    const optionElements = Array.from(
      deepHtmlSearch(
        section,
        '[role="option"]',
        true,
        question.items[i]._options.length,
      ),
    );
    const correctOption = question.items[i]._options.find(
      (option) => option._isCorrect,
    );

    for (const optionElement of optionElements) {
      if (optionElement.textContent.trim() === correctOption.text.trim()) {
        section.addEventListener("click", () => {
          if (currentIteration !== iteration) return;

          optionElement.click();
        });

        optionElement.addEventListener("mouseover", (e) => {
          if (currentIteration !== iteration) return;
          if (e.ctrlKey) {
            optionElement.click();
          }
        });
        break;
      }
    }
  });
};

const initClickListeners = () => {
  const currentIteration = iteration;

  questions.forEach((question) => {
    if (question.skip) return;

    question.questionElement?.addEventListener("click", () => {
      if (currentIteration !== iteration) return;

      if (question.questionType === "basic") {
        const component = components.find((c) => c._id === question.id);

        question.inputs.forEach(({ input, label }, i) => {
          const shouldBeSelected = component._items[i]._shouldBeSelected;
          const isCurrentlyChecked = input.checked;

          if (shouldBeSelected && !isCurrentlyChecked) {
            setTimeout(() => label.click(), 10);
          } else if (!shouldBeSelected && isCurrentlyChecked) {
            label.click();
          }
        });
      } else if (question.questionType === "match") {
        question.inputs.forEach((input) => {
          input[0].click();
          input[1].click();
        });
      } else if (question.questionType === "dropdownSelect") {
        question.inputs[0]?.click();
      }
    });
  });
};

const initHoverListeners = () => {
  const currentIteration = iteration;

  questions.forEach((question) => {
    if (question.skip) return;

    const component = components.find((c) => c._id === question.id);

    if (question.questionType === "basic") {
      question.inputs.forEach(({ input, label }, i) => {
        label?.addEventListener("mouseover", (e) => {
          if (currentIteration !== iteration) return;

          if (e.ctrlKey) {
            const shouldBeSelected = component._items[i]._shouldBeSelected;
            const isCurrentlyChecked = input.checked;

            if (shouldBeSelected && !isCurrentlyChecked) {
              setTimeout(() => label.click(), 10);
            } else if (!shouldBeSelected && isCurrentlyChecked) {
              label.click();
            }
          }
        });
      });
    } else if (question.questionType === "match") {
      question.inputs.forEach((input) => {
        input[0]?.addEventListener("mouseover", (e) => {
          if (currentIteration !== iteration) return;

          if (e.ctrlKey) {
            input[0].click();
            input[1].click();
          }
        });
      });
    } else if (question.questionType === "dropdownSelect") {
      question.inputs[0]?.addEventListener("mouseover", (e) => {
        if (currentIteration !== iteration) return;

        if (e.ctrlKey) {
          question.inputs[0].click();
        }
      });
    }
  });
};

const removeTagsFromString = (string) =>
  string.replace(/<[^>]*>?/gm, "").trim();

const setIsReady = () => {
  if (components.length === 0) {
    return false;
  }

  for (const component of components) {
    const questionDiv = deepHtmlSearch(
      document,
      `.${CSS.escape(component._id)}`,
    );

    if (questionDiv) {
      return true;
    }
  }

  return false;
};

const main = async () => {
  questions = [];
  iteration++;

  try {
    await setQuestionSections();
    setQuestionElements();
    initClickListeners();
    initHoverListeners();
  } catch (error) {
    console.error(error);
  }
};

const suspendMain = () => {
  if (isSuspendRunning) {
    return;
  }

  let isReady = false;
  let attempts = 0;
  const maxAttempts = 30;
  isSuspendRunning = true;

  const checking = async () => {
    attempts++;

    if (!isReady) {
      isReady = !!setIsReady();
    } else {
      clearInterval(interval);
      await main();
      isInitiated = true;
      isSuspendRunning = false;
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      isSuspendRunning = false;
    }
  };

  const interval = setInterval(checking, 1000);
};

const startContentWatcher = () => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  let lastCheckTime = Date.now();

  checkInterval = setInterval(() => {
    if (
      !isSuspendRunning &&
      components.length > 0 &&
      Date.now() - lastCheckTime > 2000
    ) {
      const isReady = setIsReady();

      if (isReady) {
        const uninitializedComponents = components.filter((component) => {
          const questionDiv = deepHtmlSearch(
            document,
            `.${CSS.escape(component._id)}`,
          );
          const isInQuestions = questions.some((q) => q.id === component._id);
          return questionDiv && !isInQuestions;
        });

        if (uninitializedComponents.length > 0) {
          lastCheckTime = Date.now();
          suspendMain();
        }
      }
    }
  }, 2000);
};

if (window) {
  let previousUrl = "";

  const checkUrlChange = () => {
    const currentUrl = window.location.href;

    if (currentUrl !== previousUrl) {
      previousUrl = currentUrl;

      setTimeout(() => {
        if (!isSuspendRunning && components.length > 0) {
          suspendMain();
        }
      }, 1500);
    }
  };

  setInterval(checkUrlChange, 500);
  startContentWatcher();
  checkUrlChange();
}
