import * as ts from "typescript";
import {
  AnalysisResult,
  ReactProp,
  ReactState,
  ReactRef,
  ReactMemo,
  ReactCallback,
  ReactStoreUse,
  StyledComponent,
  ReactEffect,
  ReactContextUse,
} from "./semantic-analyzer";

export interface SvelteComponentIR {
  name: string;
  props: ReactProp[];
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
  imports: string[];
}

export function buildComponentIR(analysis: AnalysisResult): SvelteComponentIR {
  return {
    name: analysis.componentName,
    props: analysis.props,
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
    imports: [],
  };
}
