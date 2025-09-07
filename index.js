import express from "express";
import session from "express-session";
import pg from "pg";
import env from "dotenv";
import passport from "passport";
import bcrypt from "bcrypt";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import multer from "multer";

const app = express();
const saltRounds = process.env.SALT_ROUNDS;
env.config();
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
app.use(session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));
app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.get("/",(req,res)=>{
    res.render("index.ejs");
});


// ----------- MULTER CONFIG -----------

// Storage for freelancer photos
const freelancerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images/freelancer_images/");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split(".").pop();
    cb(null, `${uniqueName}.${ext}`);
  },
});

// Storage for client photos
const clientStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images/client_images/");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split(".").pop();
    cb(null, `${uniqueName}.${ext}`);
  },
});

// Multer uploaders
const uploadFreelancer = multer({ storage: freelancerStorage });
const uploadClient = multer({ storage: clientStorage });




// ------------ auth routes ---------------

app.get("/client_auth",(req,res)=>{
    res.render("project_clients/client_index.ejs");
});

app.get("/freelancer_auth",(req,res)=>{
    res.render("freelancer/freelancer_index.ejs")
});

app.get("/client_signup",(req,res)=>{
    res.render("project_clients/client_signup.ejs");
});

app.get("/client_login",(req,res)=>{
    res.render("project_clients/client_login.ejs");
});

app.get("/freelancer_signup",(req,res)=>{
    res.render("freelancer/freelancer_signup.ejs");
});

app.get("/freelancer_login",(req,res)=>{
    res.render("freelancer/freelancer_login.ejs");
});

app.get("/freelancer_home", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/freelancer_login");

  try {
    const freelancerDetails = await db.query(`
      SELECT 
        f.freelancer_id AS id,
        f.freelancer_email AS email,
        f.role,
        fi.profile_photo,
        fi.name,
        fi.age,
        fi.gender,
        fi.expertise_level,
        fi.skills,
        fi.hourly_charge,
        fi.bio
      FROM freelancer f
      LEFT JOIN freelancer_info fi
        ON f.freelancer_id = fi.freelancer_id
      WHERE f.freelancer_id = $1
    `, [req.user.freelancer_id]);

    const projects = await db.query(`
      SELECT p.project_id, p.project_title, p.project_skills, p.project_expertise_level, p.project_description, c.client_id,c.client_email
      FROM projects p
      JOIN client c ON p.client_id = c.client_id
      ORDER BY p.created_at DESC
    `);

    res.render("freelancer/freelancer_home.ejs", { 
      user: freelancerDetails.rows[0], 
      allProjects: projects.rows 
    });
  } catch (err) {
    console.error(err);
    res.send("Error fetching freelancer details");
  }
});


app.get("/client_home", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/client_login");

  try {
    // Fetch client details
    const clientResult = await db.query(`
      SELECT 
        c.client_id AS id,
        c.client_email AS email,
        c.role,
        ci.name,
        ci.age,
        ci.gender,
        ci.organization,
        ci.contact_info,
        ci.profile_photo
      FROM client c
      LEFT JOIN client_info ci
        ON c.client_id = ci.client_id
      WHERE c.client_id = $1
    `, [req.user.client_id]);

    const client = clientResult.rows[0];

    // Handle search
    const searchQuery = req.query.q?.trim();
    let freelancers;

    if (searchQuery) {
      const likeQuery = `%${searchQuery.toLowerCase()}%`;
      freelancers = await db.query(`
        SELECT 
          f.freelancer_id AS id,
          fi.profile_photo,
          fi.name,
          fi.expertise_level,
          fi.skills,
          fi.hourly_charge,
          fi.bio
        FROM freelancer f
        LEFT JOIN freelancer_info fi
          ON f.freelancer_id = fi.freelancer_id
        WHERE 
          LOWER(fi.name) LIKE $1
          OR LOWER(fi.skills) LIKE $1
          OR LOWER(fi.expertise_level) LIKE $1
      `, [likeQuery]);
    } else {
      freelancers = await db.query(`
        SELECT 
          f.freelancer_id AS id,
          fi.profile_photo,
          fi.name,
          fi.expertise_level,
          fi.skills,
          fi.hourly_charge,
          fi.bio
        FROM freelancer f
        LEFT JOIN freelancer_info fi
          ON f.freelancer_id = fi.freelancer_id
      `);
    }

    res.render("project_clients/client_home.ejs", {
      user: client,
      allFreelancers: freelancers.rows,
      query: searchQuery || ""
    });
    console.log(client);

  } catch (err) {
    console.error(err);
    res.send("Error loading client home page");
  }
});

app.get("/client_project_view/:cid&:pid", async (req, res) => {
  try {
    const { cid, pid } = req.params;

    const projectInfo = await db.query(
      "SELECT * FROM projects WHERE project_id = $1 AND client_id = $2",
      [pid, cid]
    );
    const projectClient = await db.query(
      "SELECT * FROM client_info WHERE client_id = $1",
      [cid]
    );
    const client12 = await db.query(
      "SELECT * FROM client  WHERE client_id = $1",
      [cid]
    );

    if (projectInfo.rows.length === 0 || projectClient.rows.length === 0) {
      return res.status(404).send("Project or client not found");
    }

    res.render("freelancer/freelancer_view_clientProjects.ejs", { projectInfo : projectInfo.rows[0] , projectClient : projectClient.rows[0] , client12: client12.rows[0]});
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});



// Client profile page
app.get("/profile/client", async (req, res) => {
  if (req.isAuthenticated() && req.user.role === "client") {
    const details = await db.query(`
      SELECT 
        c.client_id AS id,
        c.client_email AS email,
        ci.name,
        ci.age,
        ci.gender,
        ci.organization,
        ci.contact_info,
        ci.profile_photo
      FROM client c
      LEFT JOIN client_info ci ON c.client_id = ci.client_id
      WHERE c.client_id = $1
    `, [req.user.client_id]);

    res.render("project_clients/client_profile.ejs", { user: details.rows[0] });
  } else {
    res.redirect("/client_login");
  }
});

app.post("/profile/client", uploadClient.single("photo"), async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/client_login");

  try {
    const clientId = req.user.client_id;
    const { name, age, gender, organization, contact } = req.body;
    const photoPath = req.file ? `/images/client_images/${req.file.filename}` : null;

    await db.query(
      `UPDATE client_info
       SET profile_photo = $2,
           name = $3,
           age = $4,
           gender = $5,
           organization = $6,
           contact_info = $7,
           updated_at = NOW()
       WHERE client_id = $1`,
      [clientId, photoPath, name, age, gender, organization, contact]
    );

    res.redirect("/client_home");
  } catch (err) {
    console.error(err);
    res.redirect("/profile/client");
  }
});



// Freelancer profile page
app.get("/profile/freelancer", async (req, res) => {
  if (req.isAuthenticated() && req.user.role === "freelancer") {
    const details = await db.query(`
      SELECT 
        f.freelancer_id AS id,
        f.freelancer_email AS email,
        fi.profile_photo,
        fi.name,
        fi.age,
        fi.gender,
        fi.expertise_level,
        fi.skills,
        fi.hourly_charge,
        fi.bio
      FROM freelancer f
      LEFT JOIN freelancer_info fi ON f.freelancer_id = fi.freelancer_id
      WHERE f.freelancer_id = $1
    `, [req.user.freelancer_id]);

    res.render("freelancer/freelancer_profile.ejs", { user: details.rows[0] });
  } else {
    res.redirect("/freelancer_login");
  }
});

app.post("/profile/freelancer", uploadFreelancer.single("photo"), async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/freelancer_login");

  try {
    const freelancerId = req.user.freelancer_id;
    const { name, age, gender, expertise_level, skills, hourly_charge, bio } = req.body;
    const photoPath = req.file ? `/images/freelancer_images/${req.file.filename}` : null;

    await db.query(
      `UPDATE freelancer_info
       SET profile_photo = $2,
           name = $3,
           age = $4,
           gender = $5,
           expertise_level = $6,
           skills = $7,
           hourly_charge = $8,
           bio = $9,
           updated_at = NOW()
       WHERE freelancer_id = $1`,
      [freelancerId, photoPath, name, age, gender, expertise_level, skills, hourly_charge, bio]
    );

    res.redirect("/freelancer_home");
  } catch (err) {
    console.error(err);
    res.redirect("/profile/freelancer");
  }
});


app.get("/freelancer/:id",async(req,res)=>{
  if (!req.isAuthenticated()) return res.redirect("/client_login");
  try {
    const result = await db.query("SELECT * from freelancer WHERE freelancer_id = $1 ",[req.params.id]);
    if(result.rows.length === 0 ){
      res.redirect("/client_home");
    }else{
      const resultInfo = await db.query("SELECT * from freelancer_info WHERE freelancer_id = $1",[req.params.id]);
      res.render("project_clients/client_freelancer_profile.ejs",{freelancer:result.rows[0], freelancer_info: resultInfo.rows[0]});
    }  
  } catch (err) {
      console.log(err);
  }
});


app.get("/client_freelancer_profile_back",async(req,res)=>{
  if (!req.isAuthenticated()) return res.redirect("/client_login");
  try {
    res.redirect("/client_home")
  } catch (err) {
      console.log(err);
  }
});



app.get("/chat/:id",(req,res)=>{
  if (!req.isAuthenticated()) return res.redirect("/client_login");
  const client_id = req.user.client_id;
  const freelancer_id = req.params.id;
  console.log(client_id);
  console.log(freelancer_id);
})





// Show project form
app.get("/client_addProject", (req, res) => {
  if (!req.isAuthenticated() || req.user.role !== "client") {
    return res.redirect("/client_login");
  }
  res.render("project_clients/client_project_add.ejs", { user: req.user });
});

// Handle project submission
app.post("/client_addProject", async (req, res) => {
  if (!req.isAuthenticated() || req.user.role !== "client") {
    return res.redirect("/client_login");
  }

  try {
    const { project_title, project_skills, project_expertise_level, project_description } = req.body;

    await db.query(
      `INSERT INTO projects (client_id, project_title, project_skills, project_expertise_level, project_description)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.client_id, project_title, project_skills, project_expertise_level, project_description]
    );


    res.redirect("/client_home");
  } catch (err) {
    console.error(err);
    res.send("Error adding project");
  }
});




app.get("/freelancer/projects", async (req, res) => {
  if (!req.isAuthenticated() || req.user.role !== "freelancer") {
    return res.redirect("/freelancer_login");
  }

  try {
    const projects = await db.query(`
      SELECT 
        p.project_id,
        p.project_title,
        p.project_skills,
        p.project_expertise_level,
        p.project_description,
        p.client_id,
        ci.name AS client_name,
        ci.organization AS client_org
      FROM projects p
      LEFT JOIN client_info ci
        ON p.client_id = ci.client_id
      ORDER BY p.created_at DESC
    `);

    res.render("freelancer/freelancer_view_clientProjects.ejs", {
      user: req.user,
      allProjects: projects.rows,
    });
  } catch (err) {
    console.error(err);
    res.send("Error loading projects");
  }
});










app.get("/auth/google/client", passport.authenticate("google", { scope: ["profile","email"], state: "client" }));
app.get("/auth/google/freelancer", passport.authenticate("google", { scope: ["profile","email"], state: "freelancer" }));

app.get("/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    if (req.user.role === "client") {
      if (req.user.isNew) {
        return res.redirect("/client_newSignupForm");
      }
      return res.redirect("/client_home");
    } else if (req.user.role === "freelancer") {
      if (req.user.isNew) {
        return res.redirect("/freelancer_newSignupForm");
      }
      return res.redirect("/freelancer_home");
    } else {
      res.redirect("/");
    }
  }
);



app.get("/freelancer_newSignupForm",(req,res)=>{
    if(req.isAuthenticated()){
        res.render("freelancer/freelancer_newSignupForm.ejs");
    }else{
        res.redirect("/freelancer_login");
    }

    
});

app.get("/client_newSignupForm",(req,res)=>{
    if(req.isAuthenticated()){
        res.render("project_clients/client_newSignupForm.ejs");
    }else{
        res.redirect("/client_login");
    }
});


// -------------------- CLIENT SIGNUP --------------------
app.post("/client_signup", async (req,res)=>{
  const email = req.body.email;
  const password = req.body.password;

  try {
    const result = await db.query("SELECT * FROM client WHERE client_email = $1", [email]);
    if (result.rows.length > 0) {
      return res.redirect("/client_login");
    }

    const hashedPassword = await bcrypt.hash(password, parseInt(saltRounds));
    const clientDetails = await db.query(
      "INSERT INTO client (client_email, client_password, role) VALUES ($1, $2, $3) RETURNING *",
      [email, hashedPassword, "client"]
    );

    req.login(clientDetails.rows[0], (err) => {
      if (err) return console.log(err);
      res.redirect("/client_newSignupForm");
    });

  } catch (err) {
    console.log(err);
  }
});

// -------------------- CLIENT LOGIN --------------------
app.post("/client_login", passport.authenticate("local", {
  successRedirect: "/client_home",
  failureRedirect: "/client_login",
}));


// -------------------- FREELANCER SIGNUP --------------------
app.post("/freelancer_signup", async (req,res)=>{
  const email = req.body.email;
  const password = req.body.password;

  try {
    const result = await db.query("SELECT * FROM freelancer WHERE freelancer_email = $1", [email]);
    if (result.rows.length > 0) {
      return res.redirect("/freelancer_login");
    }

    const hashedPassword = await bcrypt.hash(password, parseInt(saltRounds));
    const freelancerDetails = await db.query(
      "INSERT INTO freelancer (freelancer_email, freelancer_password, role) VALUES ($1, $2, $3) RETURNING *",
      [email, hashedPassword, "freelancer"]
    );

    req.login(freelancerDetails.rows[0], (err) => {
      if (err) return console.log(err);
      res.redirect("/freelancer_newSignupForm");
    });

  } catch (err) {
    console.log(err);
  }
});

// -------------------- FREELANCER LOGIN --------------------
app.post("/freelancer_login", passport.authenticate("local", {
  successRedirect: "/freelancer_home",
  failureRedirect: "/freelancer_login",
}));

app.get("/logout",(req,res)=>{
    req.logout(function (err){
        if(err){
            return console.log(err);
        }else{
            res.redirect("/");
        }
    });
});


app.post("/freelancer_newSignupForm", uploadFreelancer.single("photo"), async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/freelancer_login");

  try {
    const freelancerId = req.user.freelancer_id; // comes from session
    const { name, age, gender, expertise_level, skills, hourly_charge, bio } = req.body;

    // build photo path
    const photoPath = req.file ? `/images/freelancer_images/${req.file.filename}` : null;

    await db.query(
      `INSERT INTO freelancer_info 
      (freelancer_id, profile_photo, name, age, gender, expertise_level, skills, hourly_charge, bio) 
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [freelancerId, photoPath, name, age, gender, expertise_level, skills, hourly_charge, bio]
    );

    res.redirect("/freelancer_home");
  } catch (err) {
    console.error(err);
    res.redirect("/freelancer_newSignupForm");
  }
});


app.post("/client_newSignupForm", uploadClient.single("photo"), async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/client_login");

  try {
    const clientId = req.user.client_id;
    const { name, age, gender, organization, contact } = req.body;

    const photoPath = req.file ? `/images/client_images/${req.file.filename}` : null;

    await db.query(
      `INSERT INTO client_info 
      (client_id, profile_photo, name, age, gender, organization, contact_info) 
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [clientId, photoPath, name, age, gender, organization, contact]
    );

    res.redirect("/client_home");
  } catch (err) {
    console.error(err);
    res.redirect("/client_newSignupForm");
  }
});




passport.use(
  "local",
  new Strategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true,   // 👈 this lets us access req
    },
    async function verify(req, email, password, cb) {
      const role = req.body.role; // ✅ now you can safely use req
      try {
        const result = await db.query(
          `SELECT * FROM ${role} WHERE ${role}_email = $1`,
          [email]
        );

        if (result.rows.length === 0) {
          return cb(null, false, { message: "User not found" });
        }

        const passwordColumn = `${role}_password`;
        const userPassword = result.rows[0][passwordColumn];

        bcrypt.compare(password, userPassword, (err, valid) => {
          if (err) return cb(err);
          if (valid) return cb(null, result.rows[0]);
          return cb(null, false, { message: "Invalid password" });
        });
      } catch (err) {
        return cb(err);
      }
    }
  )
);


passport.use("google", new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, profile, cb) => {
    try {
      const role = req.query.state; // "client" or "freelancer"
      const email = profile.emails[0].value;

      if (!["client", "freelancer"].includes(role)) {
        return cb(new Error("Invalid role"));
      }

      const table = role;
      const column = `${role}_email`;

      const existingUser = await db.query(
        `SELECT * FROM ${table} WHERE ${column} = $1`,
        [email]
      );

      if (existingUser.rows.length > 0) {
        // Existing user
        return cb(null, existingUser.rows[0]);
      }

      // New user
      const newUser = await db.query(
        `INSERT INTO ${table} (${column}, ${role}_password, role) 
         VALUES ($1, $2, $3) RETURNING *`,
        [email, profile.id, role]
      );

      // Mark user as new
      const user = newUser.rows[0];
      user.isNew = true;
      return cb(null, user);

    } catch (err) {
      return cb(err);
    }
  }
));


passport.serializeUser((user,cb)=>{cb(null,user);});
passport.deserializeUser((user,cb)=>{cb(null,user);});

app.listen(3000,()=>{
    console.log("http://localhost:3000");
});