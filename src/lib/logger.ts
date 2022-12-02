export let logger: typeof console = console;

const noop = () => {};

export const loggerUtil = {
  disable: () => {
    logger = {
      ...console,
      info: noop,
      log: noop,
      warn: noop,
      error: noop,
    };
  },
  enable: () => {
    logger = console;
  },
};
