-- Two passes: register targets before resolving references, including forward links.
local targets, counts, sections = {}, {}, {}
local names = {fig='Figure', tbl='Table', eq='Equation', sec='Section', lst='Listing'}
local function prefix(id) return id:match('^(%a+):') end
local function register(id, kind, number)
  if targets[id] then error('Duplicate cross-reference id: ' .. id) end
  targets[id] = names[kind] .. ' ' .. number
end
local function numbered(id, kind)
  counts[kind] = (counts[kind] or 0) + 1
  if id ~= '' then register(id, kind, counts[kind]) end
  return names[kind] .. ' ' .. counts[kind]
end
local function caption(cap, label)
  local lead = {pandoc.Str(label .. ':'), pandoc.Space()}
  if #cap.long == 0 then cap.long = {pandoc.Plain({})} end
  cap.long[1].content = pandoc.List(lead) .. cap.long[1].content
  return cap
end
function Pandoc(doc)
  targets, counts, sections = {}, {}, {}
  local base, appendixLevel
  doc:walk({Header=function(h) if not base or h.level < base then base=h.level end end})
  doc = doc:walk({
    Header=function(h)
      local title = pandoc.utils.stringify(h.content)
      if appendixLevel and h.level <= appendixLevel then appendixLevel=nil end
      if title:match('^Appendix') then appendixLevel=h.level end
      if appendixLevel or title:match('^References$') or title:match('^Appendix') then
        h.classes:insert('unnumbered')
      end
      if h.classes:includes('unnumbered') then return h end
      sections[h.level] = (sections[h.level] or 0) + 1
      for i=h.level+1,6 do sections[i]=nil end
      local ns={}
      for i=base,h.level do ns[#ns+1]=tostring(sections[i] or 0) end
      if prefix(h.identifier)=='sec' then register(h.identifier,'sec',table.concat(ns,'.')) end
      return h
    end,
    Figure=function(f) f.caption=caption(f.caption,numbered(f.identifier,'fig')); return f end,
    Table=function(t) if #t.caption.long == 0 and t.identifier == '' then return end; t.caption=caption(t.caption,numbered(t.identifier,'tbl')); return t end,
    CodeBlock=function(c)
      if prefix(c.identifier) ~= 'lst' then return end
      local label=numbered(c.identifier,'lst')
      local id=c.identifier; c.identifier=''
      local text=c.attributes.caption or ''; c.attributes.caption=nil
      local blocks = pandoc.read(text, 'markdown').blocks
      local inlines = #blocks > 0 and blocks[1].content or {}
      local cap = pandoc.List({pandoc.Str(label .. ':'), pandoc.Space()}) .. inlines
      return pandoc.Div({pandoc.Para(cap),c},pandoc.Attr(id,{'listing'}))
    end,
    Para=function(p)
      if #p.content==3 and p.content[1].t=='Math' and p.content[1].mathtype=='DisplayMath'
          and p.content[3].t=='Str' then
        local id=p.content[3].text:match('^{#(eq:[^}]+)}$')
        if id then
          local label=numbered(id,'eq')
          return pandoc.Div({pandoc.Para({p.content[1],pandoc.Space(),
            pandoc.Span({pandoc.Str('(' .. counts.eq .. ')')},pandoc.Attr('',{'equation-number'}, {['aria-label']=label}))})},
            pandoc.Attr(id,{'equation'}))
        end
      end
    end
  })
  local missing={}
  doc=doc:walk({Cite=function(c)
    local has=false
    for _,ref in ipairs(c.citations) do if names[prefix(ref.id)] then has=true end end
    if not has then return end
    local out={}
    for i,ref in ipairs(c.citations) do
      if i>1 then out[#out+1]=pandoc.Str(';'); out[#out+1]=pandoc.Space() end
      if names[prefix(ref.id)] then
        if not targets[ref.id] then
          io.stderr:write('Unknown cross-reference id: ' .. ref.id .. '\n'); missing[ref.id]=true
        end
        for _,v in ipairs(ref.prefix) do out[#out+1]=v end
        out[#out+1]=pandoc.Link({pandoc.Str(targets[ref.id] or ref.id)},'#'..ref.id)
        for _,v in ipairs(ref.suffix) do out[#out+1]=v end
      else
        out[#out+1]=pandoc.Cite({pandoc.Str('@'..ref.id)},{ref})
      end
    end
    return out
  end})
  if next(missing) then error('Unresolved cross-references; build aborted') end
  return doc
end
