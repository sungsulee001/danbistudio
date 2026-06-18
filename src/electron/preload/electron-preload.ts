import { contextBridge, ipcRenderer } from 'electron';
import { createEditorPreloadApi } from './editor-api';
import type { EditorIpcChannel, EditorIpcRequestMap } from '../shared/ipc-contract';

const invoke = <Channel extends EditorIpcChannel>(
  channel: Channel,
  payload: EditorIpcRequestMap[Channel],
) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('danbiEditor', createEditorPreloadApi(invoke));
