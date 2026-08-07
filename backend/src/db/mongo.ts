import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URL || 'mongodb://localhost:27017/arriendaya_scraper';
export const MONGO_DB = process.env.MONGO_DB || 'arriendaya_scraper';
export const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'inmuebles_scrapeados';

export const mongoClient = new MongoClient(uri);

export async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}
