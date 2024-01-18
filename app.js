// const bodyParser = require('body-parser');
// app.use(bodyParser.json());
require("dotenv").config();
const http = require("http");
const { exec } = require("child_process");
const socketIO = require("socket.io");
const PORT = process.env.PORT || 4000;
const multer = require("multer");
const bodyParser = require("body-parser");
const base64ToImage = require("base64-to-image");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const path = require("path");
const cron = require("node-cron");
const { generateUniqueId, generateUserId } = require("./utils");
const initializeDB = require("./InitialiseDb/index");
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());
app.use(
  bodyParser.json({
    limit: "50mb", //increased the limit to receive base64
  })
);
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000,
  })
);
const bettingWheelValues = [5, 5, 5, 5, 10, 15, 25, 45];
let bettingInfoArray = [];
const beansToDiamondsRate = 1;
let bettingGameparticipants = 0;
const postsController = require("./controller/postsController");
const gamesController = require("./controller/gamesController");
const authenticationController = require("./controller/authentication");
const bdRoutes = require("./routes/bd");
const {
  User,
  Top3Winners,
  bettingGameData,
  SpinnerGameWinnerHistory,
} = require("./models/models");
const { send } = require("process");

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, `public/${req.body.path}`);
  },
  filename: (req, file, cb) => {
    const filename = req.body.fileName;
    cb(null, `${filename}`);
  },
});

const upload = multer({
  storage: multerStorage,
});

const authenticateToken = (request, response, next) => {
  let iChatJwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    iChatJwtToken = authHeader.split(" ")[1];
  }
  if (iChatJwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(iChatJwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.userId = payload.userId;
        next();
      }
    });
  }
};

initializeDB();
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.post("/upload", (req, res, next) => {
  const uuid = uuidv4();
  var filename = req.body.filename;
  var base64url = req.body.base64url;
  var base64Str = "data:image/png;base64," + base64url;
  var path = "./public/";
  var optionalObj = {
    fileName: filename,
    type: "png",
  };
  base64ToImage(base64Str, path, optionalObj); //saving
  var imageInfo = base64ToImage(base64Str, path, optionalObj);
  var fileLink = "/" + filename;
});

app.post("/api/update-server", async (req, res) => {
  console.log("Updating Server: ");
  const payload = req.body;
  if (
    (payload && payload.force && payload.force == true) ||
    (payload && payload.ref === "refs/heads/master")
  ) {
    exec("git reset --hard && git pull", (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        res.status(500).send("Internal Server Error");
        return;
      }
      console.log(`Git Pull Successful: ${stdout}`);
      res.status(200).send("Server Updated Successfully");
    });
  } else {
    res.status(200).send("Ignoring non-master branch push event");
  }
});

function ensureWheelNumbers(array) {
  const resultArray = [];

  // Create an object to store entries based on wheel number
  const wheelNumberMap = {};

  // Populate the map with existing entries
  array.forEach((entry) => {
    wheelNumberMap[entry.wheelNo] = entry;
  });

  // Check and add entries for missing wheel numbers
  for (let i = 1; i <= 8; i++) {
    const existingEntry = wheelNumberMap[i];

    if (existingEntry) {
      // If entry exists, add it to the result array
      resultArray.push(existingEntry);
    } else {
      // If entry doesn't exist, add an entry with zero amount
      resultArray.push({
        userids: [],
        wheelNo: i,
        totalAmount: 0,
        betreturnvalue: 0,
      });
    }
  }

  return resultArray;
}

app.post("/otp", authenticationController.sendOtp);

app.post("/verify-otp", authenticationController.verifyOtp);

app.post("/api/register", authenticationController.register);

app.post("/api/user", async (req, res) => {
  const {
    id,
    email,
    password,
    name,
    gender,
    dob,
    country,
    frame,
    photo,
    phoneNumber,
  } = req.body;
  try {
    var existingUserInfo;
    if (phoneNumber) {
      existingUserInfo = await User.findOne({
        $or: [{ email }, { phoneNumber }],
      });
    } else {
      existingUserInfo = await User.findOne({ $or: [{ email }] });
    }
    if (existingUserInfo) {
      res.status(400).send("email or phoneNumber is already taken");
      return;
    }
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    // let randomNumber = generateUserId();
    // const existingUserWithId = await User.find({ userId: randomNumber });
    // if (existingUserWithId.length > 0) {
    //   isUserIdMatched = true;
    //   while (isUserIdMatched) {
    //     randomNumber = generateUserId();
    //     const existingUserWithId = await User.find({ userId: randomNumber });
    //     isUserIdMatched = existingUserWithId.length > 0;
    //   }
    // }
    let newUserId;
    const ExistingUsers = await User.find({});
    if (ExistingUsers.length === 0) {
      newUserId = 20240000;
    } else {
      newUserId = parseInt(ExistingUsers[ExistingUsers.length - 1].userId) + 1;
    }
    const newUser = new User({
      userId: `${newUserId}`,
      // userId: id,
      email,
      password: hashedPassword,
      name,
      gender,
      dob: new Date(dob),
      country,
      frame,
      photo,
      phoneNumber,
    });
    let x = await newUser.save();
    res.status(200).send(x);
  } catch (e) {
    console.log(e);
    res.status(500).send("internal server error");
  }
});

app.delete("/api/user", authenticationController.deleteUser);
app.delete("/api/agent", authenticationController.deleteAgent);
app.delete("/api/agency", authenticationController.deleteAgency);
app.delete("/api/bd", authenticationController.deleteBd);

// app.get("/api/user", async (req, res) => {
//   const { userId } = req.query
//   try {
//     const UserInfo = await User.findOne({ userId })
//     res.send(UserInfo)

//   } catch (e) {
//     console.log(e);
//     res.status(500).send("internal server error");
//   }
// })

app.put("/api/user", async (req, res) => {
  const { userId } = req.body;
  try {
    const UserInfo = await User.findOneAndUpdate(
      { userId },
      { ...req.body },
      { new: true }
    );
    if (UserInfo) {
      res.send(UserInfo);
    } else {
      res.status(400).send("user not found");
    }
  } catch (e) {
    console.log(e);
    res.status(500).send("internal server error");
  }
});

app.post("/api/SignInWithGoggle", authenticationController.SignInWithGoggle);

app.post("/api/login", authenticationController.login);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/posts/", postsController.storePost);

app.put("/api/posts/share", postsController.sharePost);

app.get("/api/hot", postsController.getHotPosts);

app.get("/api/recent", postsController.getRecentPosts);

app.post("/api/follow", postsController.followUser);

app.get("/api/following", postsController.getPostsOfFollowingUsers);

app.get("/api/tags/", postsController.getTagsAfterDate);

app.post("/api/search-with-tags", postsController.getPostsContaingTags);

app.post("/api/comment", postsController.commentPost);

app.post("/api/like", postsController.likePost);

app.get("/api/users/following", postsController.getFollowingUsers);

app.get("/api/users/followers", postsController.getFollowersOfUser);

app.get("/api/users/doesFollow", postsController.doesFollow);

app.get("/api/followers", postsController.getFollowersData);

app.get("/api/following-users", postsController.getFollowingData);

app.get("/api/friends", postsController.getFriendsData);

app.post("/api/create-transaction-history", gamesController.postData);

app.get("/api/beans-history", gamesController.getBeansHistory);

app.get("/api/diamonds-history", gamesController.getDiamondsHistory);

app.get("/api/users", gamesController.getUsers);

app.get("/api/convert", gamesController.convert); // ACHAL: create a TransactionHistory here

app.put("/api/agent/convert", gamesController.convertUsertoAgent); //done

app.post("/api/agent", gamesController.postAgent);

app.get("/api/agent", gamesController.getAgentData);

app.get("/api/users/all", gamesController.getAllUsers);

app.get("/api/agents/all", gamesController.getAllAgents);

app.get("/api/agent/resellers", gamesController.getResellers);

app.post("/api/change-role", gamesController.ChangeUserRole);

app.post("/api/agency-joining", gamesController.joinAgency);

app.post("/api/make-agency-owner", gamesController.makeAgencyOwner);

app.put("/api/send-gift", gamesController.sendGift);

app.put("/api/agent-recharge", gamesController.recharge);

app.put("/api/agent-admin-recharge", gamesController.adminRecharge);

app.get("/api/agencies/all", gamesController.getAllAgencies);

app.put("/api/make-agent", gamesController.makeAgent);

app.get("/api/comments", postsController.getsCommentsOfPost);

app.get("/api/agency", gamesController.getAgencyDataOfUser);

// app.post("/api/spinner-betting", async (req, res) => {
//   const { userId, wheelNo, amount } = req.body;
//   var userExists = bettingInfoArray.some((item) => item.userId === userId);

//   if (!userExists) bettingGameparticipants += 1;
//   bettingInfoArray.push({ userId, wheelNo, amount });
//   await User.updateOne(
//     { userId: userId },
//     { $inc: { diamondsCount: -1 * amount } }
//   );
//   // res.send("betted successfully");
// });

app.post("/api/top3-winner", gamesController.getBettingResults);

app.get("/api/all-history", gamesController.getSpinnerHistory);

app.get("/api/agency/all", gamesController.getAllAgencies);

app.get("/api/agency/participants", gamesController.getAgencyParticipants);

app.post("/api/agency/collect", gamesController.collectBeans);

app.get("/api/my-betting-history", gamesController.getUserAllBettingHistory);
// app.post("/api/top-3-winners",gamesController.getTop3winners)
app.get("/api/top-winner", gamesController.getTopWinners);

app.get("/api/gift-history", gamesController.getGiftHistory);

app.get("/api/bd/all", bdRoutes.getAllBD);
app.get("/api/bd", bdRoutes.getBD);
app.get("/api/bd/participants", bdRoutes.getParticipantAgencies);
app.post("/api/bd", bdRoutes.createBD);
app.put("/api/bd", bdRoutes.updateBD);
app.put("/api/bd/add-beans", bdRoutes.addBeans); // ACHAL: create a TransactionHistory here
app.post("/api/bd/add-agency", bdRoutes.addAgency);
app.put("/api/bd/remove-agency", bdRoutes.removeAgency);

var gameProperties = {
  gameStartTime: null,
  gameEndTime: null,
  bettingEndTime: null,
  totalBet: null,
  totalPlayers: null,
  result: null,
  // myBet: null,
  gameName: null,
};

function updateGameProperties(data) {
  if (data.gameStartTime) gameProperties.gameStartTime = data.gameStartTime;
  if (data.gameEndTime) gameProperties.gameEndTime = data.gameEndTime;
  if (data.bettingEndTime) gameProperties.bettingEndTime = data.bettingEndTime;
  if (data.totalBet) gameProperties.totalBet = data.totalBet;
  if (data.totalPlayers) gameProperties.totalPlayers = data.totalPlayers;
  if (data.result) gameProperties.result = data.result;
  if (data.myBet) gameProperties.myBet = data.myBet;
  if (data.gameName) gameProperties.gameName = data.gameName;
}

function sendGameUpdate(event, socket = null, data = null) {
  var sendData = {
    ...gameProperties,
    ...(data ? data : {}),
  };
  console.log(`Sending Game Update: ${event} | gameProperties:`, sendData);
  if (socket) {
    socket.emit(event, sendData);
  } else {
    io.emit(event, sendData);
  }
}

async function gameStarts() {
  gameProperties = {};
  updateGameProperties({ gameStartTime: new Date() });
  sendGameUpdate("game-started");
}

async function bettingEnds() {
  const { totalBet, result } = await endBetting();
  console.log(`result: ${result}`);
  updateGameProperties({
    bettingEndTime: new Date(),
    totalBet: totalBet,
    totalPlayers: bettingGameparticipants,
    result: result,
  });
  sendGameUpdate("betting-ended");
}

async function gameEnds() {
  updateGameProperties({ gameEndTime: new Date() });
  sendGameUpdate("game-ended");
  bettingInfoArray = [];
  try {
    await Top3Winners.deleteMany({});
  } catch (e) {
    console.log(e);
  }
  bettingGameparticipants = 0;
}

async function endBetting() {
  // ACHAL: update TransactionHistory here for every user according to gamename
  console.log("bettingInfoArray", bettingInfoArray);
  if (bettingInfoArray.length === 0) {
    return {
      totalBet: 0,
      result: Math.floor(Math.random() * 8) + 1,
    };
  } else {
    const totalbettAmount = bettingInfoArray.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const amountToconsider = totalbettAmount * 0.9;
    const transformedData = bettingInfoArray.reduce((result, current) => {
      // Find the existing entry for the current wheelNo
      const existingEntry = result.findIndex(
        (entry) => entry.wheelNo === current.wheelNo
      );

      if (existingEntry !== -1) {
        // If the entry exists, update the userids and total amount
        if (!result[existingEntry].userids.includes(current.userId)) {
          result[existingEntry].userids.push(current.userId);
        }
        result[existingEntry].totalAmount += current.amount;
      } else {
        // If the entry doesn't exist, create a new one
        result.push({
          userids: [current.userId],
          wheelNo: current.wheelNo,
          totalAmount: current.amount,
        });
      }

      return result;
    }, []);
    console.log("transformedData", transformedData);
    let newtransformedData = transformedData.map((data, index) => ({
      userids: data.userids,
      wheelNo: data.wheelNo,
      totalAmount: data.totalAmount,
      betreturnvalue: bettingWheelValues[index] * data.totalAmount,
    }));

    newtransformedData.sort((a, b) => b.betreturnvalue - a.betreturnvalue);
    console.log(newtransformedData);
    let nearestEntry;
    let minDifference;
    if (newtransformedData.length > 0) {
      minDifference = amountToconsider - newtransformedData[0].betreturnvalue;
    }

    let i = 1;
    newtransformedData = ensureWheelNumbers(newtransformedData);

    while (minDifference < 0 && i <= newtransformedData.length - 1) {
      minDifference = amountToconsider - newtransformedData[i].betreturnvalue;
      nearestEntry = newtransformedData[i];
      i++;
    }
    console.log("nearestEntry", nearestEntry);
    //nearestEntry contains wheelNo won and bettingGameparticipants conatins total players total bet in totalbettAmount
    let multiplyvalue = 0;
    if (nearestEntry !== undefined) {
      multiplyvalue = bettingWheelValues[nearestEntry.wheelNo - 1];
    }
    bettingInfoArray.forEach(async (betItem) => {
      console.log("betItem:", betItem);
      if (
        nearestEntry.userids.includes(betItem.userId) &&
        betItem.wheelNo === nearestEntry.wheelNo
      ) {
        await SpinnerGameWinnerHistory.create(
          { userId: betItem.userId },
          {
            diamondsEarned: betItem.amount * multiplyvalue,
            wheelNo: betItem.wheelNo,
          }
        );
        console.log("Updating wallet", betItem.amount * multiplyvalue);
        await User.updateOne(
          { userId: betItem.userId },
          { $inc: { diamondsCount: betItem.amount * multiplyvalue } }
        );
      }
    });
    let resultArray, betInfoFiltered;
    if (nearestEntry !== undefined) {
      await bettingGameData.create({
        participants: bettingGameparticipants,
        winners: nearestEntry.userids.length,
      });
      betInfoFiltered = bettingInfoArray.filter(
        (item) =>
          item.wheelNo === nearestEntry.wheelNo &&
          nearestEntry.userids.includes(item.userId)
      );
      resultArray = betInfoFiltered.reduce((acc, current) => {
        var existingUser = acc.findIndex(
          (item) => item.userId === current.userId
        );

        if (existingUser !== -1) {
          acc[existingUser].amount += current.amount * multiplyvalue;
        } else {
          acc.push({
            userId: current.userId,
            wheelNo: current.wheelNo,
            amount: current.amount * multiplyvalue,
          });
        }

        return acc;
      }, []);
      resultArray.sort((a, b) => b.amount - a.amount);

      let top3Entries = resultArray.slice(0, 3);
      top3Entries = top3Entries.map((item) => ({
        userId: item.userId,
        winningAmount: bettingWheelValues[item.wheelNo - 1] * item.amount,
      }));
      await Top3Winners.create({ Winners: top3Entries });

      let UserBetAmount = bettingInfoArray.reduce((acc, current) => {
        var existingUserIndex = acc.findIndex(
          (item) => item.userId === current.userId
        );
        if (current.wheelNo !== nearestEntry.wheelNo) {
          if (existingUserIndex !== -1) {
            acc[existingUserIndex].amount += current.amount;
          } else {
            acc.push({
              userId: current.userId,
              amount: current.amount,
            });
          }
        }

        return acc;
      }, []);
      UserBetAmount.forEach((item) => {
        SpinnerGameWinnerHistory.findOneAndUpdate(
          { userId: item.userId },
          { $inc: { diamondsSpent: item.amount } },
          { upsert: true }
        );
      });
    }
    return {
      totalBet: totalbettAmount,
      result: nearestEntry !== undefined ? nearestEntry.wheelNo : null,
    };
  }
}

// exports.bettingInfoArray = bettingInfoArray;
io.on("connection", (socket) => {
  console.log(`some user with id ${socket.id} connected`);
  socket.on("get-status", async (data) => {
    const userId = data.userId;
    console.log("userId", userId);
    if (userId) {
      const user = await User.findOne({ userId: userId });
      console.log("user", user);
      sendGameUpdate("game-status", socket, {
        diamonds: user.diamondsCount,
      });
    } else {
      sendGameUpdate("game-status");
    }
  });
  socket.on("join-game", (data) => {
    const userId = data.userId;
    const gameName = data.gameName;
    console.log(`${userId} wants to join the game ${gameName}`);
    sendGameUpdate("game-status");
  });
  socket.on("bet", async (data) => {
    if (gameProperties.bettingEndTime) {
      console.log("Betting has already ended. Can't bet");
      return;
    }
    const userId = data.userId;
    const gameName = data.gameName;
    const wheelNo = data.wheelNo;
    const amount = data.amount;
    var userExists = bettingInfoArray.some((item) => item.userId === userId);

    if (!userExists) bettingGameparticipants += 1;

    const updatedUser = await User.findOneAndUpdate(
      { userId: userId, diamondsCount: { $gte: amount } },
      { $inc: { diamondsCount: -1 * amount } },
      { new: true }
    );

    if (!updatedUser) {
      sendGameUpdate("bet-status", socket, {
        diamonds: updatedUser.diamondsCount,
        status: "rejected",
      });
    } else {
      bettingInfoArray.push({ userId, wheelNo, amount });
      console.log(
        `${userId} betted on the game ${gameName} at ${wheelNo} with ${amount}`
      );
      sendGameUpdate("bet-status", socket, {
        diamonds: updatedUser.diamondsCount,
        status: "accepted",
      });
    }
  });
  // TODO: an event for checking the leaderboard
});

async function startANewGame() {
  try {
    setTimeout(gameStarts, 0, io); // Betting Starts
    setTimeout(bettingEnds, 30000); // Betting Ends & send result
    setTimeout(gameEnds, 40000, io); // 10 sec spinner + 10 sec leaderboard
  } catch (e) {
    console.error("Error in Game:", e);
  }
  setTimeout(startANewGame, 45000); // New Game Begins
}

startANewGame();
console.log("Some change");
