export interface UnusedType {
  unusedField: string;
  duplicateField: string;
}

export interface DuplicateInterface {
  field1: string;
  field2: number;
}

export interface DuplicateInterface {
  field3: boolean;
  field4: string[];
}

export type UnusedTypeAlias = string | number;

export const unusedImport = 'unused';

export const duplicateImport = 'duplicate'; 