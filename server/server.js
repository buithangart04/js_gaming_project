const io = require("socket.io")();
const {
  initGame,
  gameLoop,
  getUpdatedVelocity,
  createNewPlayer,
  checkCharacterDeath,
  removeBot,
  getUpdateBotsDirection,
  checkBotCombat
} = require("./game");
const { getCurrentPlayer } = require("./utils");
const { FRAME_RATE } = require("./constant");
let state;
let count = 0;
let threadMap;
io.on("connection", (client) => {
  client.on("newGame", handleNewgame);
  client.on("mousemove", handleMouseMove);
  client.on("combat", handleCombat);
  client.on('disconnect', function () {
    clearInterval(threadMap.get(client.id));
    threadMap.delete(client.id);
    if(!state) return;
    for(let i=0;i< state.players.length;++i){
     if(state.players[i].isPlayer) return; 
    }
    state = undefined;
    count=0;
  });

  function handleMouseMove(clientX, clientY) {
    if (!state) return;
    let thisPlayer = getCurrentPlayer(state, client.number);
    if (!thisPlayer) return;
    if (thisPlayer.recover_time > 0) return;
    const pos = getUpdatedVelocity(thisPlayer, clientX, clientY);
    thisPlayer.angle = pos.angle;
  }
  function handleNewgame(name) {
    name = name.trim()==''?'Unknown Warrior'+count:name;
    if (!state) {
      threadMap = new Map();
      state = initGame(name);
    } else {
      let isRemove = removeBot(state);
      if(!isRemove) {client.emit('fullOfRoom'); return;}
      let newPlayer = createNewPlayer(true,name);
      newPlayer.id= count;
      state.players.push(newPlayer);
    }
    startInterval();
    client.number = count++;
    client.emit("init", client.number);
  }
  function startInterval() {
    const threadId = setInterval(() => {
      const winner = gameLoop(state, client.number);
      if (!winner) {
          const [firstKey] = threadMap.keys();
          if(firstKey == client.id) {
            getUpdateBotsDirection(state);
            checkBotCombat(state);
          }
          checkCharacterDeath(state, io);
          emitGameState(state); 
      } else {
        io.sockets.emit(
          "gameover",
          JSON.stringify({ number: winner, isWinner: true })
        );
        state.players= state.players.filter(e => e.id != client.number);
      }
    }, 1000 / FRAME_RATE);
    threadMap.set(client.id,threadId);
  }
  function emitGameState(gameState) {
    // Send this event to everyone in the room.
    io.sockets.emit("gameState", JSON.stringify(gameState));
  }
  function handleCombat() {
    // this will attack an angle 120 degrees
    let thisPlayer = getCurrentPlayer(state, this.number);
    if (thisPlayer.recover_time > 0) return;
    thisPlayer.recover_time = 500;
  }
});

io.listen(process.env.PORT || 3000)