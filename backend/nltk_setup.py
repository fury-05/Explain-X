import nltk
nltk.download('punkt')
nltk.download('punkt_tab')

print("Downloading embedding model (BAAI/bge-small-en-v1.5)...")
from fastembed import TextEmbedding
_ = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
print("Embedding model ready.")
