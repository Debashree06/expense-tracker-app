import React, {useEffect, useState} from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Text,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

interface Expense {
  id?: string; // id is optional because backend uses _id
  _id?: string;
  amount: number;
  description: string;
  category: string;
  date?: string; // backend expects date
  timestamp?: number; // for local use
  synced: boolean;
  userId?: string;
}

const API_URL = 'http://10.0.2.2:5000/api'; // Use 10.0.2.2 for Android emulator, port 5000
const USER_ID = 'user123'; // static userId as in web app

interface ExpenseItemProps {
  item: Expense;
}

function App(): React.JSX.Element {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [newExpense, setNewExpense] = useState({
    amount: '',
    description: '',
    category: '',
  });

  useEffect(() => {
    loadLocalExpenses();
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
      if (state.isConnected) {
        syncExpenses();
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const loadLocalExpenses = async () => {
    try {
      const storedExpenses = await AsyncStorage.getItem('expenses');
      if (storedExpenses) {
        setExpenses(JSON.parse(storedExpenses));
      } else {
        // If no local, try to fetch from server
        if (isOnline) {
          fetchExpensesFromServer();
        }
      }
    } catch (error) {
      console.error('Error loading expenses:', error);
    }
  };

  const fetchExpensesFromServer = async () => {
    try {
      const response = await axios.get(`${API_URL}/expenses/${USER_ID}`);
      setExpenses(response.data);
      await AsyncStorage.setItem('expenses', JSON.stringify(response.data));
    } catch (error) {
      console.error('Error fetching expenses from server:', error);
    }
  };

  const syncExpenses = async () => {
    try {
      // Get unsynced expenses
      const unsyncedExpenses = expenses.filter(exp => !exp.synced);
      // Sync each unsynced expense
      for (const expense of unsyncedExpenses) {
        try {
          // Prepare expense for backend
          const payload = {
            ...expense,
            userId: USER_ID,
            date: expense.date || new Date(expense.timestamp || Date.now()).toISOString(),
          };
          await axios.post(`${API_URL}/expenses`, payload);
          // Update local expense as synced
          const updatedExpenses = expenses.map((exp: Expense) =>
            (exp._id === expense._id || exp.id === expense.id) ? {...exp, synced: true} : exp
          );
          setExpenses(updatedExpenses);
          await AsyncStorage.setItem('expenses', JSON.stringify(updatedExpenses));
        } catch (error) {
          console.error('Error syncing expenses:', error);
        }
      }
      // Fetch latest expenses from server
      await fetchExpensesFromServer();
    } catch (error) {
      console.error('Error syncing expenses:', error);
    }
  };

  const mergeExpenses = (local: Expense[], server: Expense[]) => {
    // Not used anymore, as we fetch from server after sync
    return server;
  };

  const addExpense = async () => {
    if (!newExpense.amount || !newExpense.description || !newExpense.category) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    const now = Date.now();
    const expense: Expense = {
      id: now.toString(),
      amount: parseFloat(newExpense.amount),
      description: newExpense.description,
      category: newExpense.category,
      date: new Date(now).toISOString(),
      timestamp: now,
      synced: isOnline,
      userId: USER_ID,
    };
    const updatedExpenses = [expense, ...expenses];
    setExpenses(updatedExpenses);
    await AsyncStorage.setItem('expenses', JSON.stringify(updatedExpenses));
    if (isOnline) {
      try {
        await axios.post(`${API_URL}/expenses`, expense);
        await fetchExpensesFromServer();
      } catch (error) {
        console.error('Error adding expense to server:', error);
        // Mark as unsynced if server request fails
        expense.synced = false;
        const updatedExpenses = [expense, ...expenses];
        setExpenses(updatedExpenses);
        await AsyncStorage.setItem('expenses', JSON.stringify(updatedExpenses));
      }
    }
    setNewExpense({amount: '', description: '', category: ''});
  };

  const deleteExpense = async (expenseId: string) => {
    // Remove from local state and AsyncStorage
    const updatedExpenses = expenses.filter(
      exp => exp._id !== expenseId && exp.id !== expenseId
    );
    setExpenses(updatedExpenses);
    await AsyncStorage.setItem('expenses', JSON.stringify(updatedExpenses));
    // Remove from backend if online
    if (isOnline) {
      try {
        await axios.delete(`${API_URL}/expenses/${expenseId}`);
      } catch (error) {
        console.error('Error deleting expense from server:', error);
      }
    }
  };

  const renderRightActions = (item: Expense) => (
    <TouchableOpacity
      style={styles.deleteButton}
      onPress={() => {
        Alert.alert(
          'Delete Expense',
          'Are you sure you want to delete this expense?',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Delete', style: 'destructive', onPress: () => deleteExpense(item._id || item.id || '')},
          ]
        );
      }}
    >
      <Text style={styles.deleteButtonText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderExpense = ({item}: ExpenseItemProps): React.JSX.Element => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <View style={styles.expenseItem}>
        <View style={styles.expenseHeader}>
          <Text style={styles.expenseAmount}>₹{item.amount.toFixed(2)}</Text>
          <Text style={styles.expenseCategory}>{item.category}</Text>
        </View>
        <Text style={styles.expenseDescription}>{item.description}</Text>
        <Text style={styles.expenseDate}>
          {item.date ? new Date(item.date).toLocaleString() : (item.timestamp ? new Date(item.timestamp).toLocaleString() : '')}
          {!item.synced && ' (Offline)'}
        </Text>
      </View>
    </Swipeable>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.title}>Expense Tracker</Text>
          <Text style={styles.subtitle}>
            {isOnline ? 'Online' : 'Offline Mode'}
          </Text>
        </View>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Amount"
            value={newExpense.amount}
            onChangeText={(text: string) => setNewExpense({...newExpense, amount: text})}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            placeholder="Description"
            value={newExpense.description}
            onChangeText={(text: string) => setNewExpense({...newExpense, description: text})}
          />
          <TextInput
            style={styles.input}
            placeholder="Category"
            value={newExpense.category}
            onChangeText={(text: string) => setNewExpense({...newExpense, category: text})}
          />
          <TouchableOpacity style={styles.addButton} onPress={addExpense}>
            <Text style={styles.addButtonText}>Add Expense</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={expenses}
          renderItem={renderExpense}
          keyExtractor={item => (item._id || item.id || Math.random().toString())}
          style={styles.list}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  inputContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  expenseItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  expenseCategory: {
    fontSize: 16,
    color: '#666',
  },
  expenseDescription: {
    fontSize: 16,
    color: '#444',
    marginBottom: 8,
  },
  expenseDate: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '90%',
    borderRadius: 8,
    marginVertical: 8,
    alignSelf: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default App;
