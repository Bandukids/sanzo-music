// Shared demo catalogue: Explore and Library resolve the same song IDs.
export const communityTracks = [
 {id:'blue',title:'Blue Hour',artist:'Luna Waves',creator:'luna',style:'chill',tags:['Lo-fi','Electronic'],art:'forest.jpg',cover:'forest',caption:'blue\nhour.',duration:204,prompt:'蓝调时刻的城市，温暖的 Lo-fi 节奏，轻柔合成器和微风般的旋律。',plays:84200,likes:2810,score:96,fresh:7,model:'ACE-Step-V15-XL',accent:'#638eb5'},
 {id:'afterglow',title:'Afterglow',artist:'NEON / 霓虹',creator:'neon',style:'electronic',tags:['Electronic','Dreamy'],art:'liquid-glass.png',cover:'glass',caption:'AFTER\nGLOW',duration:186,prompt:'日落之后，城市的声音慢慢变轻。流动的合成器、温暖的低音，留住光散去之前的最后一刻。',plays:126400,likes:4230,score:99,fresh:12,model:'MiniMax-Music-3',accent:'#fa975b'},
 {id:'deep',title:'深海失重',artist:'南屿',creator:'nanyu',style:'ambient',tags:['Ambient','Atmospheric'],art:'coast.jpg',cover:'deep',caption:'深 海\n失 重',duration:232,prompt:'像在深海里缓慢漂浮。安静的钢琴和宽阔的声场，把每一次呼吸交还给自己。',plays:67300,likes:3190,score:94,fresh:9,model:'YUE2',accent:'#508bbc'},
 {id:'sunset',title:'Sunset Boulevard',artist:'Oliver Chen',creator:'oliver',style:'pop',tags:['Indie Pop','Warm'],art:'coast.jpg',cover:'sunset',caption:'Sunset\nBoulevard',duration:198,prompt:'沿海公路的日落，清新吉他与轻快鼓点。一段关于自由、浪漫和远方的旅程。',plays:98300,likes:3610,score:97,fresh:8,model:'MiniMax-Music-3',accent:'#df9564'},
 {id:'jazz',title:'Midnight in Paris',artist:'J. Laurent',creator:'laurent',style:'jazz',tags:['Jazz','Late Night'],art:'forest.jpg',cover:'jazz',caption:'Midnight\nin Paris',duration:218,prompt:'巴黎雨夜的一间咖啡馆。温暖的爵士钢琴和刷奏鼓组，陪你把时间过得慢一点。',plays:51200,likes:2180,score:93,fresh:4,model:'ACE-Step-V15-XL',accent:'#b18562'},
 {id:'dream',title:'星河入梦',artist:'Echo Studio',creator:'echo',style:'cinematic',tags:['Cinematic','Dreamy'],art:'mountains.jpg',cover:'dream',caption:'星河\n入梦',duration:245,prompt:'层层展开的弦乐与柔和电子脉冲。抬头看向星空，给还未到达的远方写一封信。',plays:112800,likes:3920,score:98,fresh:10,model:'YUE2',accent:'#6e8cbd'},
 {id:'tide',title:'潮汐之间',artist:'南屿',creator:'nanyu',style:'ambient',tags:['Ambient','Ocean'],art:'coast.jpg',cover:'deep',caption:'潮汐\n之间',duration:226,prompt:'海风、缓慢的和弦，还有潮汐之间很长的留白。给一个安静的下午。',plays:28400,likes:1290,score:90,fresh:15,model:'YUE2',accent:'#508bbc'},
 {id:'velvet',title:'Velvet Room',artist:'J. Laurent',creator:'laurent',style:'jazz',tags:['Jazz','Soul'],art:'forest.jpg',cover:'jazz',caption:'VELVET\nROOM',duration:193,prompt:'柔软的爵士和弦，带一点午夜的温度。灯光渐暗，旋律仍然留在房间里。',plays:31800,likes:1680,score:91,fresh:14,model:'ACE-Step-V15-XL',accent:'#b18562'},
 {id:'satellite',title:'Satellite Hearts',artist:'NEON / 霓虹',creator:'neon',style:'electronic',tags:['Electronic','Synthwave'],art:'liquid-glass.png',cover:'glass',caption:'SATELLITE\nHEARTS',duration:211,prompt:'在城市上空绕行的卫星，把每一道霓虹连接成跳动的节拍。',plays:43200,likes:1940,score:92,fresh:16,model:'MiniMax-Music-3',accent:'#fa975b'},
 {id:'postcard',title:'夏日明信片',artist:'Oliver Chen',creator:'oliver',style:'pop',tags:['Indie Pop','Acoustic'],art:'coast.jpg',cover:'sunset',caption:'夏日\n明信片',duration:177,prompt:'一张来自夏天的明信片。轻快的原声吉他，装着阳光、海岸和没有说完的话。',plays:39700,likes:1870,score:89,fresh:13,model:'MiniMax-Music-3',accent:'#df9564'},
 {id:'rain',title:'Rain on Tape',artist:'Luna Waves',creator:'luna',style:'chill',tags:['Lo-fi','Piano'],art:'forest.jpg',cover:'forest',caption:'rain\non tape.',duration:189,prompt:'雨落在窗边，磁带里留下细碎的钢琴声。适合读书、发呆，以及想念。',plays:58900,likes:2530,score:95,fresh:11,model:'ACE-Step-V15-XL',accent:'#638eb5'},
 {id:'horizon',title:'Beyond the Horizon',artist:'Echo Studio',creator:'echo',style:'cinematic',tags:['Cinematic','Orchestral'],art:'mountains.jpg',cover:'dream',caption:'BEYOND\nTHE HORIZON',duration:256,prompt:'从一颗安静的钢琴音开始，越过山脊，走向辽阔的交响声场。',plays:24500,likes:1160,score:88,fresh:17,model:'YUE2',accent:'#6e8cbd'}
];
export const creators = [
 {id:'neon',name:'NEON / 霓虹',initial:'N',art:'liquid-glass.png',description:'把城市的光，写进电子旋律。',genre:'Electronic',followers:'24.8k',tracks:2},
 {id:'luna',name:'Luna Waves',initial:'L',art:'forest.jpg',description:'给每一个安静的夜晚。',genre:'Lo-fi',followers:'18.6k',tracks:2},
 {id:'echo',name:'Echo Studio',initial:'E',art:'mountains.jpg',description:'为想象中的电影配乐。',genre:'Cinematic',followers:'21.3k',tracks:2},
 {id:'nanyu',name:'南屿',initial:'南',art:'coast.jpg',description:'收集海风，与声音的留白。',genre:'Ambient',followers:'12.9k',tracks:2},
 {id:'oliver',name:'Oliver Chen',initial:'O',art:'coast.jpg',description:'旋律里，总有一个夏天。',genre:'Indie Pop',followers:'16.2k',tracks:2},
 {id:'laurent',name:'J. Laurent',initial:'J',art:'forest.jpg',description:'在爵士里，把时间放慢。',genre:'Jazz',followers:'10.4k',tracks:2}
];
export const genres = [
 {id:'chill',name:'Lo-fi',subtitle:'慢一点，刚刚好',art:'forest.jpg'},
 {id:'electronic',name:'Electronic',subtitle:'跟随城市的脉冲',art:'liquid-glass.png'},
 {id:'pop',name:'Indie Pop',subtitle:'让旋律吹进日常',art:'coast.jpg'},
 {id:'ambient',name:'Ambient',subtitle:'留一点空间给自己',art:'coast.jpg'},
 {id:'jazz',name:'Jazz',subtitle:'夜色里的即兴',art:'forest.jpg'},
 {id:'cinematic',name:'Cinematic',subtitle:'为想象打开声场',art:'mountains.jpg'}
];
export const defaultAlbums = () => [
 {id:'album-night',title:'午夜来信',description:'留给安静夜晚的声音。',art:'forest.jpg',tracks:['blue','jazz'],updated:'示例专辑'},
 {id:'album-sunset',title:'日落电台',description:'在日落与暮色之间。',art:'coast.jpg',tracks:['sunset','afterglow'],updated:'示例专辑'},
 {id:'album-space',title:'星河漂流',description:'一些关于远方和梦境的声音。',art:'mountains.jpg',tracks:['deep','dream'],updated:'示例专辑'}
];
