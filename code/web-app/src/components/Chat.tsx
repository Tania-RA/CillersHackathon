import React, { useEffect, useState } from 'react'
import { GET_PRODUCTS, ADD_PRODUCT, REMOVE_PRODUCT, PRODUCT_ADDED_SUBSCRIPTION } from '../graphql/operations';
import { useQuery, useMutation } from '@apollo/client';
import { LANGUAGES, ZubaanLanguage } from '../utils/languages';
import LanguagePicker from './LanguagePicker';
import { runOpenAi } from '../api/openai';

interface Product {
  id: string;
  name: string;
}

interface GetProductsQuery {
  products: Product[];
}

type Message = {
  text: string;
  by: 'me' | 'ai';
}


const Chat = () => {
  const [sourceLanguage, setSourceLanguage] = useState<ZubaanLanguage>(LANGUAGES[0])
  const [targetLanguage, setTargetLanguage] = useState<ZubaanLanguage>(LANGUAGES[0])
  const [prompt, setPrompt] = useState('');
  const [newProductText, setNewProductText] = useState('');
  const [pushToKafka, setPushToKafka] = useState(false);
  const { data, loading, error, subscribeToMore } = useQuery(GET_PRODUCTS);
  const [addProduct] = useMutation(ADD_PRODUCT, { errorPolicy: "all" });
  const [removeProduct] = useMutation(REMOVE_PRODUCT);

  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    subscribeToMore({
      document: PRODUCT_ADDED_SUBSCRIPTION,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;
        const newProduct = subscriptionData.data.productAdded;

        if (prev.products.some((product: Product) => product.id === newProduct.id)) {
          return prev;
        }
        return Object.assign({}, prev, {
          products: [...prev.products, newProduct]
        });
      },
    });
  }, [subscribeToMore]);

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-base-300">
      <button className="btn">
        <span className="loading loading-spinner"></span>
        Loading...
      </button>
    </div>
  );
  if (error) return <p>{'Error: ' + error}</p>;
  const handleAddProduct = async () => {
    if (!prompt.trim()) return;
    if (pushToKafka) {
      const response = await fetch('/input/add_product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceLanguage, targetLanguage, prompt, id: 'me' }),
      });
      if (response.ok) {
        setNewProductText('');
      } else {
        const errorText = await response.text();
        console.error('Failed to add product:', errorText);
      }
    } else {
      await addProduct({ variables: { sourceLanguage, targetLanguage, prompt, id: 'me' } });
      setNewProductText('');
    }
  };

  const handleRemoveProduct = async (id: string) => {
    await removeProduct({
      variables: { id },
      update(cache) {
        const existingProducts = cache.readQuery<GetProductsQuery>({ query: GET_PRODUCTS });
        if (existingProducts?.products) {
          cache.writeQuery({
            query: GET_PRODUCTS,
            data: {
              products: existingProducts.products.filter(product => product.id !== id),
            },
          });
        }
      },
    });
  };

  const sendMessage = async () => {
    setMessages((messages) => {
      return [...messages, {
        text: prompt,
        by: 'me'
      }]
    })
    const resp = await runOpenAi(sourceLanguage.name, targetLanguage.name, prompt);
    console.log({ resp })
    setMessages((messages) => {
      return [...messages, {
        text: resp[0].message.content!,
        by: 'ai'
      }]
    })
  }
  return (
    <form className='flex flex-col gap-4 py-10' style={{
      height: '100%',
      minHeight: '100%',
      flex: 1
    }} onSubmit={((ev) => {
      ev.preventDefault();
      sendMessage();
    })}>
      <div className='flex flex-col gap-4'>
        <LanguagePicker defaultLang={LANGUAGES[0]} label={'Source Language'} onChange={(lang: ZubaanLanguage) => {
          setSourceLanguage(lang);
        }} />
        <LanguagePicker defaultLang={LANGUAGES[1]} label={'Target Language'} onChange={(lang: ZubaanLanguage) => {
          setTargetLanguage(lang);
        }} />
      </div>
      <div className='flex-1'>
        {
          messages.map(message => {
            if (message.by === 'me') {
              return <div className="chat chat-end">
                <div className="chat-bubble chat-bubble-accent">{message.text}</div>
              </div>
            } else {
              return <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-primary">{message.text}</div>
              </div>
            }
          })
        }
      </div>
      <textarea onChange={(ev) => {
        setPrompt(ev.target.value);
      }} value={prompt} placeholder="What do you need translated?" className="mt-4 textarea textarea-bordered textarea-lg w-full" >
      </textarea>
      <button type="submit" className="btn">Submit</button>
    </form>
  )
}

export default Chat