// src/pages/CategoriesPage.tsx
import { useEffect, useState } from 'react';
import { api, handleApiError } from '../lib/api';
import { 
  Plus, Folder, ArrowLeft, Trash2, CheckSquare, 
  Square, Layers, Power, Search, X, Filter,
  Edit2, Save, XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export const CategoriesPage = () => {
  // --- View State ---
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);

  // --- Category Data ---
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [newCat, setNewCat] = useState({ name: '', code: '', description: '' });
  
  // EDIT STATE (Category)
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");

  // FILTERS (Category)
  const [catFilter, setCatFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [catSearch, setCatSearch] = useState("");

  // --- Topic Data ---
  const [topics, setTopics] = useState<any[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicInput, setTopicInput] = useState(""); 
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  
  // EDIT STATE (Topic)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState("");

  // FILTERS (Topic)
  const [topicFilter, setTopicFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [topicSearch, setTopicSearch] = useState("");

  // ==========================
  // 1. CATEGORY LOGIC
  // ==========================

  const fetchCats = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data.data);
    } catch(e) { toast.error("Error loading categories"); }
    finally { setLoadingCats(false); }
  };

  useEffect(() => { fetchCats(); }, []);

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/categories', { ...newCat, isActive: true });
      toast.success("Category Created!");
      setNewCat({ name: '', code: '', description: '' });
      fetchCats();
    } catch(e) { toast.error("Creation failed"); }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if(!window.confirm(`Delete category "${name}"? This will delete ALL topics inside it.`)) return;
    try {
        await api.delete(`/categories/${id}`);
        toast.success("Category deleted");
        fetchCats();
    } catch(e) { toast.error(handleApiError(e)); }
  };

  const handleToggleCategoryStatus = async (cat: any) => {
    try {
        const newStatus = !cat.isActive;
        await api.put(`/categories/${cat.id}`, { isActive: newStatus });
        toast.success(`Category ${newStatus ? 'Activated' : 'Deactivated'}`);
        fetchCats();
    } catch(e) { toast.error("Status update failed"); }
  };

  // --- CATEGORY EDIT LOGIC ---
  const startEditingCategory = (e: React.MouseEvent, cat: any) => {
    e.stopPropagation(); // Prevent opening the category
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
  };

  const cancelEditingCategory = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCatId(null);
    setEditCatName("");
  };

  const saveCategoryName = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!editCatName.trim()) return toast.error("Name cannot be empty");
    
    try {
      await api.put(`/categories/${id}`, { name: editCatName });
      toast.success("Category renamed");
      
      // Update local state to reflect change immediately
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editCatName } : c));
      setEditingCatId(null);
    } catch (err) {
      toast.error("Failed to rename category");
    }
  };

  // --- FILTERING LOGIC (CATEGORY) ---
  const filteredCategories = categories.filter(cat => {
    if (catFilter === 'active' && !cat.isActive) return false;
    if (catFilter === 'inactive' && cat.isActive) return false;
    if (catSearch) {
        const query = catSearch.toLowerCase();
        return (
            cat.name.toLowerCase().includes(query) || 
            cat.code.toLowerCase().includes(query)
        );
    }
    return true;
  });

  // ==========================
  // 2. TOPIC LOGIC
  // ==========================

  const openCategory = (cat: any) => {
    if (editingCatId) return; // Don't open if editing name
    setSelectedCategory(cat);
    setTopicFilter('all');
    setTopicSearch(""); 
    fetchTopics(cat.id);
  };

  const closeCategory = () => {
    setSelectedCategory(null);
    setTopics([]);
    setTopicInput("");
    setSelectedTopicIds([]);
    setEditingTopicId(null);
  };

  const fetchTopics = async (catId: string) => {
    setLoadingTopics(true);
    try {
      const res = await api.get(`/topics/category/${catId}`);
      setTopics(res.data.data);
    } catch (e) { toast.error("Failed to load topics"); }
    finally { setLoadingTopics(false); }
  };

  const handleBulkAddTopics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicInput.trim()) return;
    const names = topicInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (names.length === 0) return;

    const loadingToast = toast.loading(`Adding ${names.length} topics...`);
    try {
      await Promise.all(names.map(name => 
        api.post('/topics', { 
            examCategoryId: selectedCategory.id, 
            name: name,
            code: name.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 100),
            isActive: true 
        })
      ));
      toast.dismiss(loadingToast);
      toast.success(`Added ${names.length} topics!`);
      setTopicInput("");
      fetchTopics(selectedCategory.id);
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error("Some topics failed to create");
      fetchTopics(selectedCategory.id);
    }
  };

  const handleBulkDeleteTopics = async () => {
    if (!window.confirm(`Delete ${selectedTopicIds.length} selected topics?`)) return;
    const loadingToast = toast.loading("Deleting topics...");
    try {
      await Promise.all(selectedTopicIds.map(id => api.delete(`/topics/${id}`)));
      toast.dismiss(loadingToast);
      toast.success("Topics deleted");
      setSelectedTopicIds([]);
      fetchTopics(selectedCategory.id);
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error("Deletion failed");
    }
  };

  const handleBulkToggleTopicStatus = async (status: boolean) => {
    const loadingToast = toast.loading(`${status ? 'Activating' : 'Deactivating'} topics...`);
    try {
        await Promise.all(selectedTopicIds.map(id => api.put(`/topics/${id}`, { isActive: status })));
        toast.dismiss(loadingToast);
        toast.success("Status updated");
        setSelectedTopicIds([]);
        fetchTopics(selectedCategory.id);
    } catch (e) {
        toast.dismiss(loadingToast);
        toast.error("Update failed");
    }
  };

  // --- TOPIC EDIT LOGIC ---
  const startEditingTopic = (topic: any) => {
    setEditingTopicId(topic.id);
    setEditTopicName(topic.name);
  };

  const cancelEditingTopic = () => {
    setEditingTopicId(null);
    setEditTopicName("");
  };

  const saveTopicName = async (id: string) => {
    if (!editTopicName.trim()) return toast.error("Name cannot be empty");
    
    try {
      await api.put(`/topics/${id}`, { name: editTopicName });
      toast.success("Topic renamed");
      // Update local state
      setTopics(prev => prev.map(t => t.id === id ? { ...t, name: editTopicName } : t));
      setEditingTopicId(null);
    } catch (e) {
      toast.error("Failed to rename topic");
    }
  };

  const toggleSelectAll = () => {
    if (selectedTopicIds.length === topics.length) setSelectedTopicIds([]);
    else setSelectedTopicIds(topics.map(t => t.id));
  };

  const toggleSelectOne = (id: string) => {
    if (selectedTopicIds.includes(id)) setSelectedTopicIds(prev => prev.filter(tid => tid !== id));
    else setSelectedTopicIds(prev => [...prev, id]);
  };

  // --- FILTERING LOGIC (TOPIC) ---
  const filteredTopics = topics.filter(topic => {
    if (topicFilter === 'active' && !topic.isActive) return false;
    if (topicFilter === 'inactive' && topic.isActive) return false;
    if (topicSearch) {
        const query = topicSearch.toLowerCase();
        return (
            topic.name.toLowerCase().includes(query) || 
            topic.code.toLowerCase().includes(query)
        );
    }
    return true;
  });

  // ==========================
  // RENDER
  // ==========================

  // VIEW 1: TOPIC MANAGER
  if (selectedCategory) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
          <button onClick={closeCategory} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Folder className="text-blue-500" /> {selectedCategory.name}
            </h2>
            <p className="text-sm text-gray-500">Manage topics for this category</p>
          </div>
        </div>

        {/* Bulk Add Form */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Quick Add Topics</h3>
          <p className="text-xs text-gray-400 mb-3">Enter topics separated by commas (e.g. "Algebra, Geometry")</p>
          <form onSubmit={handleBulkAddTopics}>
            <textarea 
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
              placeholder="Topic 1, Topic 2, Topic 3..."
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <button type="submit" disabled={!topicInput.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                <Plus size={18} /> Add Topics
              </button>
            </div>
          </form>
        </div>

        {/* Topics List */}
        <div className="space-y-4">
          {/* --- TOPIC TOOLBAR --- */}
          <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
              
             {/* Search & Filter */}
             <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search topics..." 
                        className="pl-9 pr-8 py-1.5 rounded-lg border border-gray-300 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={topicSearch}
                        onChange={e => setTopicSearch(e.target.value)}
                    />
                    {topicSearch && (
                        <button onClick={() => setTopicSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="flex bg-white border border-gray-200 p-0.5 rounded-lg">
                    {(['all', 'active', 'inactive'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setTopicFilter(f)}
                        className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-all ${
                        topicFilter === f ? 'bg-gray-100 text-gray-800 font-bold' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {f}
                    </button>
                    ))}
                </div>
             </div>
             
             {/* Bulk Actions */}
             {selectedTopicIds.length > 0 && (
                <div className="flex gap-2 animate-in slide-in-from-right-2 fade-in">
                    <button onClick={() => handleBulkToggleTopicStatus(true)} className="bg-white border border-green-200 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-50 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                      <Power size={14} /> On
                    </button>
                    <button onClick={() => handleBulkToggleTopicStatus(false)} className="bg-white border border-orange-200 text-orange-600 px-3 py-1.5 rounded-lg hover:bg-orange-50 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                      <Power size={14} /> Off
                    </button>
                    <button onClick={handleBulkDeleteTopics} className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                      <Trash2 size={14} /> Delete
                    </button>
                </div>
             )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-gray-100 text-gray-500 text-sm uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4 w-12">
                      <button onClick={toggleSelectAll}>
                         {topics.length > 0 && selectedTopicIds.length === topics.length ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20}/>}
                      </button>
                  </th>
                  <th className="px-6 py-4">Topic Name</th>
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingTopics ? (
                   <tr><td colSpan={4} className="p-8 text-center text-gray-500">Loading...</td></tr>
                ) : filteredTopics.length === 0 ? (
                   <tr><td colSpan={4} className="p-8 text-center text-gray-400">No matching topics found.</td></tr>
                ) : filteredTopics.map((topic) => (
                  <tr key={topic.id} className={`hover:bg-gray-50 transition-colors ${!topic.isActive ? 'opacity-60 bg-gray-50' : ''} ${selectedTopicIds.includes(topic.id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleSelectOne(topic.id)}>
                        {selectedTopicIds.includes(topic.id) ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20} className="text-gray-300 hover:text-blue-500"/>}
                      </button>
                    </td>
                    
                    {/* EDITABLE NAME FIELD */}
                    <td className="px-6 py-4">
                        {editingTopicId === topic.id ? (
                            <div className="flex items-center gap-2">
                                <input 
                                    className="border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full"
                                    value={editTopicName}
                                    onChange={(e) => setEditTopicName(e.target.value)}
                                    autoFocus
                                />
                                <button onClick={() => saveTopicName(topic.id)} className="text-green-600 hover:bg-green-100 p-1 rounded"><Save size={16}/></button>
                                <button onClick={cancelEditingTopic} className="text-red-500 hover:bg-red-100 p-1 rounded"><XCircle size={16}/></button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group/edit">
                                <span className="font-medium text-gray-800">{topic.name}</span>
                                <button 
                                    onClick={() => startEditingTopic(topic)}
                                    className="opacity-0 group-hover/edit:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity"
                                >
                                    <Edit2 size={14} />
                                </button>
                            </div>
                        )}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{topic.code}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${topic.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {topic.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // VIEW 2: CATEGORY GRID
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <h2 className="text-3xl font-bold text-slate-800">Exam Categories</h2>
         
         {/* --- CATEGORY TOOLBAR (Search + Filter) --- */}
         <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search categories..." 
                    className="pl-9 pr-8 py-2 rounded-lg border border-gray-300 w-full focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    value={catSearch}
                    onChange={e => setCatSearch(e.target.value)}
                />
                {catSearch && (
                    <button onClick={() => setCatSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-white border border-gray-200 p-1 rounded-lg shadow-sm">
                {(['all', 'active', 'inactive'] as const).map((f) => (
                <button
                    key={f}
                    onClick={() => setCatFilter(f)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-all flex items-center gap-2 ${
                    catFilter === f ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {f === 'inactive' && <Power size={14} className="opacity-50"/>}
                    {f}
                </button>
                ))}
            </div>
         </div>
      </div>

      {/* Create Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">Add New Category</h3>
        <form onSubmit={createCategory} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
            <input required className="w-full border rounded-lg p-2 mt-1 outline-none focus:border-blue-500" value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})} />
          </div>
          <div className="flex-1 w-full">
            <label className="text-xs font-bold text-gray-500 uppercase">Code</label>
            <input required className="w-full border rounded-lg p-2 mt-1 outline-none focus:border-blue-500" value={newCat.code} onChange={e => setNewCat({...newCat, code: e.target.value})} />
          </div>
          <div className="flex-[2] w-full">
            <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
            <input className="w-full border rounded-lg p-2 mt-1 outline-none focus:border-blue-500" value={newCat.description} onChange={e => setNewCat({...newCat, description: e.target.value})} />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 w-full md:w-auto justify-center">
            <Plus size={18} /> Add
          </button>
        </form>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loadingCats ? <p>Loading...</p> : filteredCategories.map(cat => (
          <div 
            key={cat.id} 
            onClick={() => openCategory(cat)}
            className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group relative ${!cat.isActive ? 'opacity-75 bg-gray-50 border-dashed' : ''}`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg transition-colors ${cat.isActive ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                <Folder size={24} />
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${cat.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                {cat.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* EDITABLE TITLE */}
            {editingCatId === cat.id ? (
                <div onClick={e => e.stopPropagation()} className="mb-10">
                    <input 
                        className="w-full border rounded p-1 mb-2 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500"
                        value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button onClick={(e) => saveCategoryName(e, cat.id)} className="bg-green-100 text-green-700 px-3 py-1 rounded text-xs font-bold hover:bg-green-200 flex items-center gap-1">
                            <Save size={14}/> Save
                        </button>
                        <button onClick={(e) => cancelEditingCategory(e)} className="bg-gray-100 text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-200">
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <h3 className="text-xl font-bold text-gray-800">{cat.name}</h3>
                    <p className="text-sm text-gray-500 mt-1 mb-10 line-clamp-2">{cat.description}</p>
                </>
            )}
            
            <div className="flex justify-between items-center text-sm text-gray-400 border-t pt-4">
              <span>Code: {cat.code}</span>
              <span className="flex items-center gap-1"><Layers size={14}/> {cat._count?.topics || 0} Topics</span>
            </div>

            {/* ACTION BUTTONS (Hover) */}
            <div className="absolute bottom-4 right-4 flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                 {/* EDIT BUTTON */}
                <button 
                    onClick={(e) => startEditingCategory(e, cat)}
                    className="p-2 bg-blue-50 text-blue-500 rounded-full hover:bg-blue-100 hover:text-blue-600 transition-colors"
                    title="Edit Name"
                >
                    <Edit2 size={18} />
                </button>

                <button 
                    onClick={(e) => { e.stopPropagation(); handleToggleCategoryStatus(cat); }}
                    className={`p-2 rounded-full transition-colors flex items-center gap-1 ${
                        cat.isActive 
                        ? 'bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600' 
                        : 'bg-green-100 text-green-600 hover:bg-green-200 shadow-md ring-1 ring-green-200'
                    }`}
                    title={cat.isActive ? "Deactivate" : "Re-Activate"}
                >
                    <Power size={18} /> 
                    {!cat.isActive && <span className="text-xs font-bold pr-1">Activate</span>}
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id, cat.name); }}
                    className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
                    title="Delete Category"
                >
                    <Trash2 size={18} />
                </button>
            </div>
          </div>
        ))}
        
        {filteredCategories.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <Filter size={48} className="opacity-20 mb-2" />
                <p>No categories found matching your search or filter.</p>
                <button onClick={() => { setCatSearch(""); setCatFilter('all'); }} className="mt-2 text-blue-500 hover:underline">
                    Clear Filters
                </button>
            </div>
        )}
      </div>
    </div>
  );
};