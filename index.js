import express from "express";
import env from "dotenv";
const app = express();
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));

app.get("/",(req,res)=>{
    res.render("index.ejs");
})

// ------------ auth routes ---------------

app.get("/client_auth",(req,res)=>{
    res.render("project_clients/client_index.ejs");
})

app.get("/freelancer_auth",(req,res)=>{
    res.render("freelancer/freelancer_index.ejs")
})

app.listen(3000,()=>{
    console.log("http://localhost:3000");
})