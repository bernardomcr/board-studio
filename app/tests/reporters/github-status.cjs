'use strict';
module.exports=class GitHubStatusReporter{
  constructor(){this.results=new Map();this.queue=Promise.resolve();this.context=process.env.BOARD_TEST_STATUS_CONTEXT||'board-studio/browser-tests';}
  async onBegin(_config,suite){this.total=suite.allTests().length;await this.send('pending');}
  onTestEnd(test,result){this.results.set(test.id,result.status!==test.expectedStatus);const failed=[...this.results.values()].filter(Boolean).length;if(this.results.size%10===0||failed!==this.lastFailed){this.lastFailed=failed;const description=this.description();this.queue=this.queue.then(()=>this.send('pending',description));}}
  async onEnd(result){await this.queue;await this.send(result.status==='passed'?'success':'failure');}
  description(){return `${this.results.size}/${this.total} tests; ${[...this.results.values()].filter(Boolean).length} unexpected`;}
  async send(state,description=this.description()){
    console.log(`CI_TEST_PROGRESS ${this.context}: ${description}`);
    const token=process.env.GH_TOKEN,repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA;
    if(!token||!/^[-.\w]+\/[-.\w]+$/.test(repo||'')||!/^[a-f0-9]{40}$/i.test(sha||''))return;
    const [counts,failed]=description.split(' tests; '),[done,total]=counts.split('/'),unexpected=Number.parseInt(failed,10)||0;
    const target=`https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}#progress=${done}-${total}&unexpected=${unexpected}`;
    try{const response=await fetch(`https://api.github.com/repos/${repo}/statuses/${sha}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({state,context:this.context,description,target_url:target}),signal:AbortSignal.timeout(15000)});if(!response.ok)console.warn(`CI progress status unavailable (${response.status}).`);}catch{console.warn('CI progress status unavailable. Test results remain authoritative.');}
  }
};
