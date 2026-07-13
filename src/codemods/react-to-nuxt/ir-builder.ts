import * as ts from "typescript";
import {
  AnalysisResult,
  ReactProp,
  ReactEmit,
  ReactState,
  ReactRef,
  ReactMemo,
  ReactCallback,
  ReactStoreUse,
  StyledComponent,
  ReactEffect,
  ReactContextUse,
  ReactImport,
} from "./semantic-analyzer";

export interface NuxtComponentIR {
  name: string;
  props: ReactProp[];
  emits: ReactEmit[];
  states: ReactState[];
  refs: ReactRef[];
  memos: ReactMemo[];
  callbacks: ReactCallback[];
  stores: ReactStoreUse[];
  styledComponents: StyledComponent[];
  effects: ReactEffect[];
  methods: Array<{ name: string; body: string }>;
  contexts: ReactContextUse[];
  jsxNode?: ts.Expression;
  template: string;
  imports: ReactImport[];
  extraStatements: string[];
  externalStates: string[];
}

export function buildComponentIR(analysis: AnalysisResult): NuxtComponentIR {
  return {
    name: analysis.componentName,
    props: analysis.props,
    emits: analysis.emits,
    states: analysis.states,
    refs: analysis.refs,
    memos: analysis.memos,
    callbacks: analysis.callbacks,
    stores: analysis.stores,
    styledComponents: analysis.styledComponents,
    effects: analysis.effects,
    methods: analysis.methods.map((m) => ({ name: m.name, body: m.body })),
    contexts: analysis.contexts,
    jsxNode: analysis.jsxNode,
    template: analysis.jsxTemplate || "",
    imports: analysis.imports,
    extraStatements: analysis.extraStatements,
    externalStates: analysis.externalStates || [],
  };
}
