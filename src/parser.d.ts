import { Element } from './els';

// returns null for a line with nothing on it
export function parse(
    code: string,
    options: { source: number; line: number; [option: string]: any }
): Element[] | null;
