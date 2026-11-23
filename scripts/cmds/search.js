module.exports.config = {
    role: 0,
    countDown: 5,
    category: "info",
    shortDescription: "Search results on google",
    longDescription: "Search results on google",
    guide: "{pn} search [Text]",
    author: "0xMr_King x ┃ Tanin Islam",
  
 name: "search",
 version: "1.0.0",
 hasPermssion: 0,
 credits: "0xMr_King x ┃ Tanin Islam",
 description: "Search results on google",
 commandCategory: "info",
 usages: "search [Text]",
 cooldowns: 5,
 dependencies: {
 "request":"",
 "fs":""
 }
};

module.exports.onStart = function({ api, event, args }) {
 let textNeedSearch = "";
 const regex = /(https?:\/\/.*?\.(?:png|jpe?g|gif)(?:\?(?:[\w_-]+=[\w_-]+)(?:&[\w_-]+=[\w_-]+)*)?(.*))($)/;
 (event.type == "message_reply") ? textNeedSearch = event.messageReply.attachments[0].url: textNeedSearch = args.join(" ");
 (regex.test(textNeedSearch)) ? api.sendMessage(`https://www.google.com/searchbyimage?&image_url=${textNeedSearch}`, event.threadID, event.messageID): api.sendMessage(`https://www.google.com.vn/search?q=${encodeURIComponent(textNeedSearch)}`, event.threadID, event.messageID);
}