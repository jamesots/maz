export interface Location {
    line: number;
    column: number;
    source: number;
}
export interface Expression {
    expression: string;
    vars: string[];
    location: Location;
    address: number;
}
export interface Relative  {
    relative: Expression | number | string;
}
export interface Prefixed {
    prefix: string;    
}
export interface Locatable {
    location: Location;
}

export interface Element {
    something?: boolean; // make typescript recognise this type
}

export interface Error extends Element, Locatable {
    error: string;
    filename: string;
}
export interface Org extends Element, Locatable {
    org: string | number | Expression;
}
export interface Phase extends Element, Locatable {
    phase: string | number | Expression;
}
export interface Align extends Element, Locatable {
    align: string | number | Expression;
}
export interface Include extends Element, Locatable {
    include: string;
    included?: true;
}
export interface EndInclude extends Element, Locatable {
    endinclude: number;
}
export interface MacroCall extends Element, Prefixed, Locatable {
    macrocall: string;
    args: (string | number | Expression)[];
    params: string[];
    expanded: boolean;
}
export interface Block extends Element, Prefixed, Locatable {
    block: true;
}
export interface EndBlock extends Element, Locatable {
    endblock: true;
}
export interface Bytes extends Element, Locatable {
    bytes: (Expression | Relative | number)[];
    references: boolean;
    address: number;
    out: number;
}
export interface EndMacroCall extends Element  {
    endmacrocall: true;
}
export interface Comment extends Element, Locatable {
    comment: string;
}
export interface EndMacro extends Element, Locatable {
    endmacro: true;
}
export interface MacroDef extends Element, Locatable {
    macrodef: string;
    params: string[];
}
export interface Equ extends Element, Locatable {
    equ: Expression;
}
export interface Defs extends Element, Locatable {
    defs: Expression;
    address: number;
    out: number;
}
export interface Label extends Element, Locatable {
    label: string;
    public: boolean;
}
export interface Undocumented extends Element, Locatable {
    undoc: true;
}
export interface EndPhase extends Element {
    endphase: true;
}
export interface If extends Element, Locatable {
    if: number | string | Expression;
}
export interface EndIf extends Element, Locatable {
    endif: true;
}
export interface Else extends Element, Locatable {
    else: true;
}

export function isEqu(el: Element): el is Equ {
    return (el as Equ).equ !== undefined;
}
export function isOrg(el: Element): el is Org {
    return (el as Org).org !== undefined;
}
export function isLabel(el: Element): el is Label {
    return (el as Label).label !== undefined;
}
export function isBytes(el: Element): el is Bytes {
    return (el as Bytes).bytes !== undefined;
}
export function isUndocumented(el: Element): el is Undocumented {
    return (el as Undocumented).undoc === true;
}
export function isRelative(item: string | number | Expression | Relative): item is Relative {
    return (item as Relative).relative !== undefined;
}
export function isExpression(item: string | number | Expression | Relative): item is Expression {
    return (item as Expression).expression !== undefined;
}
export function isPrefixed(el: Element | Prefixed): el is Prefixed {
    return (el as Prefixed).prefix !== undefined;
}
export function isLocatable(el: Element | Locatable): el is Locatable {
    return (el as Locatable).location !== undefined;
}
export function isAlign(el: Element): el is Align {
    return (el as Align).align !== undefined;
}
export function isMacroCall(el: Element): el is MacroCall {
    return (el as MacroCall).macrocall !== undefined;
}
export function isMacroDef(el: Element): el is MacroDef {
    return (el as MacroDef).macrodef !== undefined;
}
export function isEndPhase(el: Element): el is EndPhase {
    return (el as EndPhase).endphase === true;
}
export function isEndMacro(el: Element): el is EndMacro {
    return (el as EndMacro).endmacro === true;
}
export function isEndMacroCall(el: Element): el is EndMacroCall {
    return (el as EndMacroCall).endmacrocall === true;
}
export function isBlock(el: Element): el is Block {
    return (el as Block).block === true;
}
export function isEndBlock(el: Element): el is EndBlock {
    return (el as EndBlock).endblock === true;
}
export function isInclude(el: Element): el is Include {
    return (el as Include).include !== undefined;
}
export function isEndInclude(el: Element): el is EndInclude {
    return (el as EndInclude).endinclude !== undefined;
}
export function isIf(el: Element): el is If {
    return (el as If).if !== undefined;
}
export function isElse(el: Element): el is Else {
    return (el as Else).else === true;
}
export function isEndIf(el: Element): el is EndIf {
    return (el as EndIf).endif === true;
}
export function isPhase(el: Element): el is Phase {
    return (el as Phase).phase !== undefined;
}
export function isDefs(el: Element): el is Defs {
    return (el as Defs).defs !== undefined;
}
