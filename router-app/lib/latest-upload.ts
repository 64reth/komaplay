export type UploadTicket = { id:number; signal:AbortSignal; current:()=>boolean; finish:()=>void };

export class LatestUploadCoordinator {
  private sequence=new Map<string,number>();
  private controllers=new Map<string,AbortController>();
  begin(key:string):UploadTicket {
    this.controllers.get(key)?.abort();
    const id=(this.sequence.get(key)??0)+1, controller=new AbortController();
    this.sequence.set(key,id);this.controllers.set(key,controller);
    const current=()=>this.sequence.get(key)===id&&!controller.signal.aborted;
    return {id,signal:controller.signal,current,finish:()=>{if(current())this.controllers.delete(key);}};
  }
  cancel(key:string){this.sequence.set(key,(this.sequence.get(key)??0)+1);this.controllers.get(key)?.abort();this.controllers.delete(key);}
  cancelAll(){for(const key of this.controllers.keys())this.cancel(key);}
}
