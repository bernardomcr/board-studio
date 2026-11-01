'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('boardStudioDesktop',Object.freeze({isDesktop:true,info:()=>ipcRenderer.invoke('board-studio:desktop-info')}));
