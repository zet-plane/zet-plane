/// <reference lib="webworker" />

import { layoutGraph, type LayoutInput, type LayoutOutput } from "./elk-layout";

type LayoutWorkerRequest = {
  id: string;
  input: LayoutInput;
};

type LayoutWorkerSuccess = {
  id: string;
  ok: true;
  result: LayoutOutput;
};

type LayoutWorkerFailure = {
  id: string;
  ok: false;
  error: string;
};

self.onmessage = async (event: MessageEvent<LayoutWorkerRequest>) => {
  try {
    const result = await layoutGraph(event.data.input);
    const message: LayoutWorkerSuccess = { id: event.data.id, ok: true, result };
    self.postMessage(message);
  } catch (error) {
    const message: LayoutWorkerFailure = {
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown layout error",
    };

    self.postMessage(message);
  }
};
