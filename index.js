const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI (Use .env for security)
const uri =
  "mongodb+srv://bondtamjid02:Tpzk32mZjmjeR6T@libsys.tkpbo.mongodb.net/?retryWrites=true&w=majority&appName=LibSys";

// Create MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let usersCollection;
let booksCollection;
let assignCollection; // <-- add this

// Connect once and keep connection alive
client
  .connect()
  .then(() => {
    const db = client.db("user_management");

    // Initialize collections after db connection
    usersCollection = db.collection("users");
    booksCollection = db.collection("books");
    assignCollection = db.collection("assign"); // <-- add this
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

// 🟢 Get all users
app.get("/api/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// 🟢 Add a new user
app.post("/api/users", async (req, res) => {
  try {
    const user = req.body;
    const result = await usersCollection.insertOne(user);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to add user" });
  }
});

// 🟢 Update user by ID
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = req.body;

    // Remove _id from updatedUser if it's in the request body
    delete updatedUser._id; // This will prevent updating the _id field, which is immutable

    // Check if the updated user data is valid
    if (
      !updatedUser.name ||
      !updatedUser.email ||
      !updatedUser.username ||
      !updatedUser.password
    ) {
      return res
        .status(400)
        .json({ error: "Please provide all necessary fields." });
    }

    // Update the user in the database
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedUser }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    // Return a success response
    res.json({ message: "User updated successfully!" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user." });
  }
});

// 🟢 Delete user by ID
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// 🟢 Get all books
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection.find().toArray();
    res.json(books);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🟢 Add a new book
app.post("/books", async (req, res) => {
  const { name, type, language, availability, quantity } = req.body;

  const newBook = {
    name,
    type,
    language,
    availability: availability || "Available",
    quantity: quantity || 1, // Default to 1 if not provided
  };

  try {
    const result = await booksCollection.insertOne(newBook);

    if (result.acknowledged === true) {
      const addedBook = await booksCollection.findOne({
        _id: result.insertedId,
      });
      res.status(201).json(addedBook); // Return the book object after inserting
    } else {
      res.status(400).json({ message: "Failed to add the book" });
    }
  } catch (err) {
    res.status(500).json({ message: "Failed to add the book" });
  }
});

// 🟢 Update a book by ID
app.put("/books/:id", async (req, res) => {
  const { id } = req.params;
  const { name, type, language, availability, quantity } = req.body;

  const updatedBook = {
    name,
    type,
    language,
    availability,
    quantity,
  };

  try {
    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedBook }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json({ message: "Book updated successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 🟢 Delete a book by ID
app.delete("/books/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.status(204).json(); // No content to return for delete operation
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 🟢 Assign books to a user (New endpoint)
app.post("/assign", async (req, res) => {
  try {
    const { userId, books, dueDate } = req.body;

    // Check if the user exists
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validate if the requested quantity is available for each book
    for (const item of books) {
      const book = await booksCollection.findOne({
        _id: new ObjectId(item.bookId),
      });
      if (!book || item.quantity > book.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for "${book?.name}". Only ${book?.quantity} available.`,
        });
      }

      // Update the quantity of the book in the books collection
      await booksCollection.updateOne(
        { _id: new ObjectId(item.bookId) },
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Create a new assignment entry in the assign collection
    const assignment = {
      userId: new ObjectId(userId),
      books,
      dueDate,
      assignedAt: new Date(),
    };

    const result = await assignCollection.insertOne(assignment);

    if (result.acknowledged) {
      res.status(200).json({ message: "Books assigned successfully!" });
    } else {
      res.status(500).json({ error: "Failed to assign books." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign books." });
  }
});

// 🟢 Get borrowed books for a user
app.get("/borrowed-books/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const assignments = await assignCollection
      .find({ userId: new ObjectId(userId) })
      .toArray();

    if (assignments.length === 0) {
      return res
        .status(404)
        .json({ message: "No borrowed books found for this user." });
    }

    const borrowedBooks = [];

    for (const assignment of assignments) {
      for (const book of assignment.books) {
        const bookDetails = await booksCollection.findOne({
          _id: new ObjectId(book.bookId),
        });
        borrowedBooks.push({
          ...bookDetails,
          quantity: book.quantity,
          dueDate: assignment.dueDate,
          assignmentId: assignment._id, // Save assignment ID for book return
        });
      }
    }

    res.json(borrowedBooks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch borrowed books." });
  }
});

// 🟢 Return books (update book quantity and remove assignment)
app.post("/return-books", async (req, res) => {
  try {
    const { userId, assignmentId, books } = req.body;

    // Find the assignment
    const assignment = await assignCollection.findOne({
      _id: new ObjectId(assignmentId),
    });
    if (!assignment || String(assignment.userId) !== userId) {
      return res
        .status(400)
        .json({ error: "Assignment not found or user mismatch." });
    }

    // Update book quantities in the books collection
    for (const book of books) {
      const bookDetails = await booksCollection.findOne({
        _id: new ObjectId(book.bookId),
      });
      if (bookDetails) {
        await booksCollection.updateOne(
          { _id: new ObjectId(book.bookId) },
          { $inc: { quantity: book.quantity } }
        );
      }
    }

    // Remove the assignment from the assignCollection
    await assignCollection.deleteOne({ _id: new ObjectId(assignmentId) });

    res.status(200).json({ message: "Books returned successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to return books." });
  }
});

// 🟢 Dashboard stats endpoint
app.get("/dashboard/stats", async (req, res) => {
  try {
    const [userCount, bookCount, books, assignments] = await Promise.all([
      usersCollection.countDocuments(),
      booksCollection.countDocuments(),
      booksCollection.find().toArray(),
      assignCollection.find().toArray(),
    ]);

    // Total returned books = sum of all available quantities
    const returnedBooks = books.reduce(
      (sum, book) => sum + (book.quantity || 0),
      0
    );

    // Total borrowed books = sum of all assigned quantities
    const borrowedBooks = assignments.reduce((sum, assignment) => {
      const totalBooksInAssignment = assignment.books.reduce(
        (subSum, b) => subSum + b.quantity,
        0
      );
      return sum + totalBooksInAssignment;
    }, 0);

    res.json({
      userCount,
      bookCount,
      borrowedBooks,
      returnedBooks,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to load dashboard statistics." });
  }
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
