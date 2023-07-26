import { jest } from '@jest/globals';

const realMathRandom = Math.random;
let mathRandomReturnValues: number[] = [];
let mathRandomReturnValuesCurrentIndex = -1;

export const mockFetch = () => {
  return jest.fn(async () => new Response());
};

export const mockMathRandom = (returnValues: number[]) => {
  if (returnValues.length === 0)
    jest.fn(() => {
      return Math.random();
    });

  mathRandomReturnValues = returnValues;

  Math.random = jest.fn(() => {
    // Simulate ring array
    mathRandomReturnValuesCurrentIndex =
      mathRandomReturnValuesCurrentIndex + 1 >= mathRandomReturnValues.length
        ? 0
        : mathRandomReturnValuesCurrentIndex + 1;

    return mathRandomReturnValues[mathRandomReturnValuesCurrentIndex];
  });
};

export const resetMathRandom = () => {
  Math.random = realMathRandom;
  mathRandomReturnValuesCurrentIndex = -1;
  mathRandomReturnValues = [];
};

const realConsole = console;
export const mockConsole = () => {
  console = {
    ...realConsole,
    log: jest.fn(() => {}),
    warn: jest.fn(() => {}),
    error: jest.fn(() => {}),
  };
};

export const resetConsole = () => {
  console = realConsole;
};
