export const DESIGN_PRESETS=Object.freeze({
 soft:'温暖柔和的成年女声，音色自然清晰，气息轻柔，语气亲切舒缓。',
 bright:'清亮自然的年轻男声，声音明亮干净，吐字清晰，表达轻松。',
 deep:'低沉磁性的成年男声，略带沙哑，音色温暖厚实，吐字清晰，语气沉稳。',
 energetic:'富有活力的主持人声音，明亮清晰，表达有感染力，节奏自然。'
});
export function speechDesignInput(body){
 const invalid=message=>Object.assign(new Error(message),{input:true});
 if(body.type!=='speech'||body.speechModel!=='design')throw invalid('请选择 Speech 音色设计。');
 const field=(name,max,fallback='')=>{const value=body[name]??fallback;if(typeof value!=='string'||value.length>max)throw invalid('语音内容格式不正确或过长。');return value.trim();};
 const designText=field('designText',3000);if(!designText)throw invalid('请填写要说的话。');
 const voiceDescription=field('voiceDescription',500),designVoice=field('designVoice',30,'soft');
 if(!Object.hasOwn(DESIGN_PRESETS,designVoice))throw invalid('请选择有效的预设声音。');
 const rawTitle=field('title',60),autoTitle=body.autoTitle===true||!rawTitle;
 return {autoTitle,type:'speech',speechModel:'design',ttsModel:'qwen-tts',model:'qwen-voice-design',title:autoTitle?'音色设计':rawTitle,designText,voiceDescription,designVoice,description:designText,styles:voiceDescription||DESIGN_PRESETS[designVoice],lyrics:'',workspace:field('workspace',120,'speech')||'speech',mode:'simple'};
}
