
var express = require('express');
var path = require('path');
var session = require('express-session');
const { MongoClient } = require("mongodb");

var cookieParser = require('cookie-parser');

var app = module.exports = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
require('dotenv').config();


const uri = process.env.MONGO_URI;

const client = new MongoClient(uri);// config

const database = client.db("isat_twitter");

const userCollection = database.collection("users");
const postCollection = database.collection("posts");
const likesCollection = database.collection("likes");
const commentsCollection = database.collection("comments");

// middleware

app.use(express.urlencoded({ extended: false }))
app.use(session({
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  secret: 'shhhh, very secret'
}));

// Session-persisted message middleware

app.use(function(req, res, next){
  var err = req.session.error;
  var msg = req.session.success;
  delete req.session.error;
  delete req.session.success;
  res.locals.message = '';
  if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
  if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
  next();
});

app.get('/create-posts', function(req,res){
  res.render('create-posts')
})

app.get('/', async function(req, res){
  const user = req.cookies['authCookie']
  if(!user){
    res.redirect('/login')
  }

  const existingUser = await userCollection.findOne({username: user})
  // console.log('TYHE EXSISTING USER IS ',existingUser)
  const transformedPost = await getPostsByTopic(existingUser)
  res.render('dashboard',{posts: transformedPost, user: existingUser})
});


async function getPostsByTopic(user){
  const subscription = user.subscription;
  const posts = await postCollection.find({
   "topic": {$in: subscription}
  }).toArray();  

  const postsWithComments = []
  for(var i=0; i< posts.length; i++ ){
    const comments = await commentsCollection.find({postId: posts[i]._id.toString()}).toArray()
    if(comments.length>0){
      console.log('COMMENTS',JSON.stringify(comments))
    }
    postsWithComments.push({...posts[i],comments:comments})

  }

  const transformedPost = {};

  for(var i=0; i< postsWithComments.length; i++ ){
     const { _id, topic, title, description,comments } = postsWithComments[i];


    const postLikedByUser = await likesCollection.findOne({username: user.username, postId: _id.toString()})

    // console.log('THE POST LIKED BY USER IS ',postLikedByUser)
    if (!transformedPost[topic]) {
      transformedPost[topic] = [];
    }

    let like = false;
    if(postLikedByUser){
      like = true;
    }else{
      like = false;
    }
  
    await transformedPost[topic].push({
      id: _id.toString(), // Convert ObjectId to string
      title: title,
      description: description,
      like: like,
      comments: comments,
    });
  }

  return transformedPost;
}

app.post('/posts',async function(req,res){
  let topic = req.body.topic
  const customTopic = req.body.customTopic
  const title = req.body.title
  const description = req.body.description
  if(customTopic != ''){
    topic = customTopic
  }
  const post = {
    topic: topic,
    title: title,
    description: description,

  }
  await postCollection.insertOne(post);
    req.session.success = 'Successfully inserted posts!!'
    res.redirect('/')
})

app.get('/like/:id',async function(req,res) {
  const id = req.params.id;
  const username = req.cookies['authCookie']
  try{
    const existingLike = await likesCollection.findOne({username: username, postId: id})
    if(!existingLike){
      const like = {
        postId : id,
        username: username
      }
      await likesCollection.insertOne(like);
      console.log(`Liked the post with id ${id}`)

    }else{
      console.log('ALREADY LIKED MAN ::: :')
    }
  
  }catch(err){
    console.log('THE ERR IS ',err)
  }

  
  const existingUser = await userCollection.findOne({username: username})
  const transformedPost = await getPostsByTopic(existingUser)
  res.render('dashboard',{posts: transformedPost, user: existingUser})
})

app.post('/comment/:id',async function(req,res) {
  const id = req.params.id;
  const commentText = req.body.commentText;
  const username = req.cookies['authCookie']
  try{
      const comment = {
        postId : id,
        commentText: commentText,
        username: username
      }
      await commentsCollection.insertOne(comment);
      console.log(`Commented the post with id ${id}`)
  }catch(err){
    console.log('THE ERR IS ',err)
  }
  const existingUser = await userCollection.findOne({username: username})
  const transformedPost = await getPostsByTopic(existingUser)
  res.render('dashboard',{posts: transformedPost, user: existingUser})
})

app.get('/logout', function(req, res){
  res.cookie('authCookie', '', { maxAge: 0 }); // Expires immediately
  // alternate approach 
  // res.clearCookie('authCookie')
  res.render('login')
});

app.get('/login', function(req, res){
  res.render('login');
});

app.get('/edit-subscription', function(req, res){
  res.render('edit-subscription');
});

app.post('/login', async function (req, res, next) {
  const username = req.body.username
  const existingUser = await userCollection.findOne({username: username})
  if(existingUser){
    res.cookie('authCookie', username, { maxAge: 3000000000 }); // Expires after 30 seconds (30000 milliseconds)
    req.session.success = 'Successfully logged in!. Hi '+username +'!!'
    res.redirect('/')

  }else{
    req.session.error = 'The username ' + username +' does not exists !!' 
    res.redirect('/login')
  }

});

app.get('/dashboard', function(req,res,next){
  res.render('dashboard');
})

app.get('/expire-cookie', function(req,res,next){
  res.cookie('authCookie', '', { maxAge: 0 }); // Expires immediately
  // alternate approach 
  // res.clearCookie('authCookie')
  res.render('login')
})

app.post('/subscribe', async function (req, res, next) {
  try{

    let subscription =  req.body.subscription

    const subscriptionItem = subscription;
    if(typeof subscription == "string"){
      subscription = []
      subscription.push(subscriptionItem)
    }


    const user = {
      username: req.body.username,
      subscription: subscription
       || [],
    }
    const existingUser = await userCollection.findOne({username: user.username})
    if(existingUser){
      const randNo = Math.floor(Math.random()* 1000 + 1)
     req.session.error = 'The username ' + user.username +' is already taken. Please try something else. \n How about  '+ user.username+randNo +'?' 
    }
    
    else{
      await userCollection.insertOne(user);
      res.cookie('authCookie', user.username, { maxAge: 30000 }); // Expires after 30 seconds (30000 milliseconds)
      req.session.success = 'Successfully inserted ' + user.username
    }

  res.redirect('/login');
  }catch(error){
    console.error('Error checking user existence:', error);
    // Handle the error as needed, e.g., set an error message and redirect
    req.session.error = 'An error occurred while checking user existence.';
    res.redirect('/login');
  }

});

app.post('/edit-subscription', async function (req, res, next) {
    const username = req.cookies['authCookie']
    let subscription =  req.body.subscription

    const subscriptionItem = subscription;
    if(typeof subscription == "string"){
      subscription = []
      subscription.push(subscriptionItem)
    }

    await userCollection.updateOne({username: username},{ $set: { subscription: subscription } })
    res.redirect('/')
});

/* istanbul ignore next */
if (!module.parent) {
  app.listen(3000);
  console.log('Express started on port 3000');
}