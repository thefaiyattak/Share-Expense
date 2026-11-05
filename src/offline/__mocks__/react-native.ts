export const AppState = {
  currentState: 'active',
  addEventListener: (_type: string, _handler: any) => ({
    remove: () => {},
  }),
};

export const Platform = {
  OS: 'android',
  select: (obj: any) => obj.android || obj.default,
};

export default {
  AppState,
  Platform,
};
