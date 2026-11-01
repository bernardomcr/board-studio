/** Document layers contain editable objects; object groups remain independent. */
export interface BoardLayer {id:string;kind:'layer'|'group';name:string;parentId?:string;hidden?:boolean;locked?:boolean}
export interface BoardLayers {version:1;nodes:BoardLayer[];activeId:string}
export interface LayerMembership {
 layerId?:string;
 /** Own flags retained only while an ancestor forces the effective flag. */
 layerOwnHidden?:boolean;
 layerOwnLocked?:boolean;
}
