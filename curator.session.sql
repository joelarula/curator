-- Check table contents
SELECT COUNT(*) FROM vector_store;
SELECT * FROM vector_store LIMIT 5;

-- Check if vectors are being stored properly
SELECT id, content, namespace, 
       embedding IS NOT NULL as has_embedding,
       length(embedding::text) as embedding_length,
       metadata
FROM vector_store
LIMIT 5;