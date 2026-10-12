import {TRAINING_AVAILABLE} from '/service-availability.js';
const main=document.querySelector('#training-content');
if(TRAINING_AVAILABLE){
 await import('/training.js');
}else{
 main.innerHTML='<div class="training-heading"><div><span class="lab-eyebrow">SANZO / MODEL LAB</span><h1>模型训练暂未开放。</h1><p>让每个人都能训练自己的音色与音乐风格，是 SANZO 的下一步计划。</p></div></div><section class="lab-empty glass"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:40px;height:40px;margin-bottom:16px"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg><h2>一起，让模型训练成为现实。</h2><p>SANZO 是一个个人项目，目前暂未购买用于模型训练的云服务器。<br>希望获得大家的赞助与支持；获得赞助后，我计划购买云端 GPU 服务器，并开放音色与音乐风格模型训练。<br>感谢你支持 SANZO 的成长。</p><a class="lab-button" href="/create/">返回创作空间</a></section>';
 document.querySelector('#training-player')?.remove();
}
main.hidden=false;
