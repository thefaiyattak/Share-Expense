export const documentDirectory = 'file:///mock/documents/';

export const makeDirectoryAsync = async (_dir: string, _options?: any): Promise<void> => {};

export const copyAsync = async (_options: { from: string; to: string }): Promise<void> => {};

export const deleteAsync = async (_uri: string, _options?: any): Promise<void> => {};

export const getInfoAsync = async (_uri: string): Promise<{ exists: boolean }> => {
  return { exists: true };
};
