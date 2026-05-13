---
title: "Abstract syntax tree - Wikipedia"
url: "https://en.wikipedia.org/wiki/Abstract_syntax_tree"
---

# Abstract syntax tree - Wikipedia

Tree representation of the abstract syntactic structure of source code

For the trees used in linguistics, see [parse tree](https://en.wikipedia.org/wiki/Parse_tree "Parse tree").

<table class="box-No_footnotes plainlinks metadata ambox ambox-style ambox-No_footnotes" role="presentation"><tbody><tr><td class="mbox-image"><div class="mbox-image-div"><span typeof="mw:File"><span><img alt="" src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Text_document_with_red_question_mark.svg/40px-Text_document_with_red_question_mark.svg.png" decoding="async" width="40" height="40" class="mw-file-element" srcset="//upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Text_document_with_red_question_mark.svg/120px-Text_document_with_red_question_mark.svg.png 2x" data-file-width="48" data-file-height="48"></span></span></div></td><td class="mbox-text"><div class="mbox-text-span">This article includes a list of references, related reading, or external links, <b>but its sources remain unclear because it lacks inline citations</b>.<span class="hide-when-compact"> Please help improve this article by introducing more precise citations.</span> <span class="date-container"><i>(<span class="date">February 2013</span>)</i></span><span class="hide-when-compact"><i> (<small>Learn how and when to remove this message</small>)</i></span></div></td></tr></tbody></table>

An abstract syntax tree for the following code for the [Euclidean algorithm](https://en.wikipedia.org/wiki/Euclidean_algorithm "Euclidean algorithm"):

while b != 0:
    if a \> b:
        a := a \- b
    else:
        b := b \- a
return a

An **abstract syntax tree** (**AST**) is a data structure used in [computer science](https://en.wikipedia.org/wiki/Computer_science "Computer science") to represent the structure of a program or code snippet. It is a [tree](https://en.wikipedia.org/wiki/Tree_\(data_structure\) "Tree (data structure)") representation of the [abstract syntactic](https://en.wikipedia.org/wiki/Abstract_syntax "Abstract syntax") structure of text (often [source code](https://en.wikipedia.org/wiki/Source_code "Source code")) written in a [formal language](https://en.wikipedia.org/wiki/Formal_language "Formal language"). Each node of the tree denotes a construct occurring in the text. It is sometimes called just a **syntax tree**.

The syntax is "abstract" in the sense that it does not represent every detail appearing in the real syntax, but rather just the structural or content-related details. For instance, grouping [parentheses](https://en.wikipedia.org/wiki/Bracket#Parentheses "Bracket") are implicit in the tree structure, so these do not have to be represented as separate nodes. Likewise, a syntactic construct like an if-condition-then statement may be denoted by means of a single node with three branches.

This distinguishes abstract syntax trees from concrete syntax trees, traditionally designated [parse trees](https://en.wikipedia.org/wiki/Parse_tree "Parse tree"). Parse trees are typically built by a [parser](https://en.wikipedia.org/wiki/Parser "Parser") during the source code translation and [compiling](https://en.wikipedia.org/wiki/Compiler "Compiler") process. Once built, additional information is added to the AST by means of subsequent processing, e.g., [contextual analysis](https://en.wikipedia.org/wiki/Semantic_analysis_\(compilers\) "Semantic analysis (compilers)").

Abstract syntax trees are also used in [program analysis](https://en.wikipedia.org/wiki/Program_analysis "Program analysis") and [program transformation](https://en.wikipedia.org/wiki/Program_transformation "Program transformation") systems.

## Application in compilers

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=1 "Edit section: Application in compilers")\]

Abstract syntax trees are [data structures](https://en.wikipedia.org/wiki/Data_structures "Data structures") widely used in [compilers](https://en.wikipedia.org/wiki/Compilers "Compilers") to represent the structure of program code. An AST is usually the result of the [syntax analysis](https://en.wikipedia.org/wiki/Syntax_analysis "Syntax analysis") phase of a compiler. It often serves as an intermediate representation of the program through several stages that the compiler requires, and has a strong effect on the final output of the compiler.

### Motivation

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=2 "Edit section: Motivation")\]

An AST has several properties that aid in the additional steps of the compilation process:

-   An AST can be edited and enhanced with information such as properties and annotations for every element it contains. Such editing and annotation is impossible with the source code of a program, since it would imply changing it.
-   Compared to the [source code](https://en.wikipedia.org/wiki/Source_code "Source code"), an AST does not include nonessential punctuation and delimiters (braces, semicolons, parentheses, etc.).
-   An AST usually contains extra information about the program, due to the consecutive stages of analysis by the compiler. For example, it may store the position of each element in the source code, allowing the compiler to print useful error messages.

Languages are often [ambiguous](https://en.wikipedia.org/wiki/Syntactic_ambiguity "Syntactic ambiguity") by nature. In order to avoid this ambiguity, programming languages are often specified as a [context-free grammar](https://en.wikipedia.org/wiki/Context-free_grammar "Context-free grammar") (CFG). However, there are often aspects of programming languages that a CFG can't express, but are part of the language and are documented in its specification. These are details that require a context to determine their validity and behavior. For example, if a language allows new types to be declared, a CFG cannot predict the names of such types nor the way in which they should be used. Even if a language has a predefined set of types, enforcing proper usage usually requires some context. Another example is [duck typing](https://en.wikipedia.org/wiki/Duck_typing "Duck typing"), where the type of an element can change depending on context. [Operator overloading](https://en.wikipedia.org/wiki/Operator_overloading "Operator overloading") is yet another case where correct usage and final function are context-dependent.

### Design

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=3 "Edit section: Design")\]

The design of an AST is often closely linked with the design of a compiler and its expected features.

Core requirements include the following:

-   Variable types must be preserved, as well as the location of each declaration in source code.
-   The order of executable statements must be explicitly represented and well defined.
-   Left and right components of binary operations must be stored and correctly identified.
-   Identifiers and their assigned values must be stored for assignment statements.

These requirements can be used to design the data structure for the AST.

Some operations will always require two elements, such as the two terms for addition. However, some language constructs require an arbitrarily large number of children, such as argument lists passed to programs from the [command shell](https://en.wikipedia.org/wiki/Command_shell "Command shell"). As a result, an AST used to represent code written in such a language has to also be flexible enough to allow for the quick addition of an unknown quantity of children.

To support compiler verification it should be possible to unparse an AST into source code form. The source code produced should be sufficiently similar to the original in appearance and identical in execution, upon recompilation. The AST is used intensively during [semantic analysis](https://en.wikipedia.org/wiki/Semantic_analysis_\(compilers\) "Semantic analysis (compilers)"), where the compiler checks for correct usage of the elements of the program and the language. The compiler also generates [symbol tables](https://en.wikipedia.org/wiki/Symbol_table "Symbol table") based on the AST during semantic analysis. A complete traversal of the tree allows verification of the correctness of the program.

After verifying correctness, the AST serves as the base for code generation. The AST is often used to generate an intermediate representation (IR), sometimes called an [intermediate language](https://en.wikipedia.org/wiki/Intermediate_language "Intermediate language"), for the code generation.

## Other usages

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=4 "Edit section: Other usages")\]

### AST differencing

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=5 "Edit section: AST differencing")\]

AST differencing, or for short tree differencing, consists of computing the list of differences between two ASTs.\[1\]\[2\] This list of differences is typically called an edit script. The edit script directly refers to the AST of the code. For instance, an edit action may result in the addition of a new AST node representing a function.

### Clone detection

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=6 "Edit section: Clone detection")\]

An AST is a powerful abstraction to perform code [clone detection](https://en.wikipedia.org/wiki/Clone_detection "Clone detection").\[3\]

## Definition

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=7 "Edit section: Definition")\]

### Arities

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=8 "Edit section: Arities")\]

Let S {\\displaystyle S} be a set of _sorts_, an _arity is a tuple_ ( s 1 , … , s n , s ) {\\displaystyle (s\_{1},\\dots ,s\_{n},s)} , for s 1 , … , s n , s ∈ S {\\displaystyle s\_{1},\\dots ,s\_{n},s\\in S} , also written as ( s 1 , … , s n ) s {\\displaystyle (s\_{1},\\dots ,s\_{n})s} . More precisely, A r i t y ( S ) := ∐ n ∈ N S n + 1 {\\displaystyle \\mathrm {Arity} (S):=\\coprod \_{n\\in \\mathbb {N} }S^{n+1}} .

Let O \= { O α } α ∈ A r i t y ( S ) {\\displaystyle {\\mathcal {O}}=\\{{\\mathcal {O\_{\\alpha }}}\\}\_{\\alpha \\in \\mathrm {Arity} (S)}} be an A r i t y ( S ) {\\displaystyle \\mathrm {Arity} (S)} \-indexed family of disjoint sets of _operators_. If o {\\displaystyle o} is an operator arity ( s 1 , … , s n ) s {\\displaystyle (s\_{1},\\dots ,s\_{n})s} we say that o {\\displaystyle o} has sort s {\\displaystyle s} and has n {\\displaystyle n} arguments of sorts s 1 , … , s n {\\displaystyle s\_{1},\\dots ,s\_{n}} .

### ASTs

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=9 "Edit section: ASTs")\]

Fix S {\\displaystyle S} be a finite set of sorts, and O {\\displaystyle {\\mathcal {O}}} an A r i t y ( S ) {\\displaystyle \\mathrm {Arity} (S)} \-indexed family of disjoint sets of _operators_. Let X \= { X s } s ∈ S {\\displaystyle {\\mathcal {X}}=\\{{\\mathcal {X}}\_{s}\\}\_{s\\in S}} be an S {\\displaystyle S} \-indexed family of disjoint sets of variables. The family A \[ X \] \= { A \[ X \] s } s ∈ S {\\displaystyle {\\mathcal {A}}\[{\\mathcal {X}}\]=\\{{\\mathcal {A}}\[{\\mathcal {X}}\]\_{s}\\}\_{s\\in S}} of _**abstract syntax trees**_, or _**AST**_s, is the smallest S {\\displaystyle S} \-indexed family of disjoint sets closed under the following conditions:

1.  **Variables are ASTs:** if x ∈ X s {\\displaystyle x\\in {\\mathcal {X}}\_{s}} , then x ∈ A \[ X \] s {\\displaystyle x\\in {\\mathcal {A}}\[{\\mathcal {X}}\]\_{s}} .
2.  **Operators combine ASTs:** If o {\\displaystyle o} is an operator of arity ( s 1 , … , s n ) s {\\displaystyle (s\_{1},\\dots ,s\_{n})s} , and a i ∈ A \[ X \] s i {\\displaystyle a\_{i}\\in {\\mathcal {A}}\[{\\mathcal {X}}\]\_{s\_{i}}} for all 1 ≤ i ≤ n {\\displaystyle 1\\leq i\\leq n} , then o ( a 1 ; … ; a n ) ∈ A \[ X \] s {\\displaystyle o(a\_{1};\\dots ;a\_{n})\\in {\\mathcal {A}}\[{\\mathcal {X}}\]\_{s}} .

## See also

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=10 "Edit section: See also")\]

-   [Abstract semantic graph](https://en.wikipedia.org/wiki/Abstract_semantic_graph "Abstract semantic graph") (ASG), also called _term graph_
-   [Composite pattern](https://en.wikipedia.org/wiki/Composite_pattern "Composite pattern")
-   [Control-flow graph](https://en.wikipedia.org/wiki/Control-flow_graph "Control-flow graph")
-   [Directed acyclic graph](https://en.wikipedia.org/wiki/Directed_acyclic_graph "Directed acyclic graph") (DAG)
-   [Document Object Model](https://en.wikipedia.org/wiki/Document_Object_Model "Document Object Model") (DOM)
-   [Expression tree](https://en.wikipedia.org/wiki/Expression_tree "Expression tree")
-   [Extended Backus–Naur form](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form "Extended Backus–Naur form")
-   [Lisp](https://en.wikipedia.org/wiki/Lisp_\(programming_language\) "Lisp (programming language)"), a family of languages written in trees, with macros to manipulate code trees
-   [Parse tree](https://en.wikipedia.org/wiki/Parse_tree "Parse tree"), also known as _concrete syntax tree_
-   [Semantic resolution tree](https://en.wikipedia.org/wiki/Semantic_resolution_tree "Semantic resolution tree") (SRT)
-   [Shunting-yard algorithm](https://en.wikipedia.org/wiki/Shunting-yard_algorithm "Shunting-yard algorithm")
-   [Syntax (programming languages)](https://en.wikipedia.org/wiki/Syntax_\(programming_languages\) "Syntax (programming languages)")
-   [Symbol table](https://en.wikipedia.org/wiki/Symbol_table "Symbol table")
-   [TreeDL](https://en.wikipedia.org/wiki/TreeDL "TreeDL")
-   [Abstract Syntax Tree Interpreters](https://en.wikipedia.org/wiki/Interpreter_\(computing\)#Variations "Interpreter (computing)")

## References

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=11 "Edit section: References")\]

1.  **^** Fluri, Beat; Wursch, Michael; PInzger, Martin; Gall, Harald (2007). ["Change Distilling:Tree Differencing for Fine-Grained Source Code Change Extraction"](https://dx.doi.org/10.1109/tse.2007.70731). _IEEE Transactions on Software Engineering_. **33** (11): 725–743\. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1109/tse.2007.70731](https://doi.org/10.1109%2Ftse.2007.70731). [ISSN](https://en.wikipedia.org/wiki/ISSN_\(identifier\) "ISSN (identifier)") [0098-5589](https://search.worldcat.org/issn/0098-5589). [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [13659557](https://api.semanticscholar.org/CorpusID:13659557).
2.  **^** Falleri, Jean-Rémy; Morandat, Floréal; Blanc, Xavier; Martinez, Matias; Monperrus, Martin (2014). "Fine-grained and accurate source code differencing". _Proceedings of the 29th ACM/IEEE International Conference on Automated Software Engineering_: 313–324\. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1145/2642937.2642982](https://doi.org/10.1145%2F2642937.2642982).
3.  **^** Koschke, Rainer; Falke, Raimar; Frenzel, Pierre (2006). ["Clone Detection Using Abstract Syntax Suffix Trees"](https://dx.doi.org/10.1109/wcre.2006.18). _2006 13th Working Conference on Reverse Engineering_. IEEE. pp. 253–262\. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1109/wcre.2006.18](https://doi.org/10.1109%2Fwcre.2006.18). [ISBN](https://en.wikipedia.org/wiki/ISBN_\(identifier\) "ISBN (identifier)") 0-7695-2719-1. [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [6985484](https://api.semanticscholar.org/CorpusID:6985484).

## Further reading

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=12 "Edit section: Further reading")\]

-   Jones, Joel. ["Abstract Syntax Tree Implementation Idioms"](https://web.archive.org/web/20240721094334/http://hillside.net/plop/plop2003/Papers/Jones-ImplementingASTs.pdf) (PDF). Archived from [the original](http://www.hillside.net/plop/plop2003/Papers/Jones-ImplementingASTs.pdf) (PDF) on 21 July 2024. Retrieved 9 November 2011. (overview of AST implementation in various language families)
-   Neamtiu, Iulian; Foster, Jeffrey S.; Hicks, Michael (May 17, 2005). _Understanding Source Code Evolution Using Abstract Syntax Tree Matching_. MSR'05. Saint Louis, Missouri: ACM. [CiteSeerX](https://en.wikipedia.org/wiki/CiteSeerX_\(identifier\) "CiteSeerX (identifier)") [10.1.1.88.5815](https://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.88.5815).
-   Würsch, Michael. [_Improving Abstract Syntax Tree based Source Code Change Detection_](http://www.ifi.uzh.ch/seal/research/tools/archive/changeDetection.html) (Diploma thesis).
-   Lucas, Jason (16 August 2006). ["Thoughts on the Visual C++ Abstract Syntax Tree (AST)"](https://devblogs.microsoft.com/cppblog/thoughts-on-the-visual-c-abstract-syntax-tree-ast/).
-   [Robert Harper](https://en.wikipedia.org/wiki/Robert_Harper_\(computer_scientist\) "Robert Harper (computer scientist)") (2016). _[Practical Foundations for Programming Languages](https://www.cs.cmu.edu/~rwh/pfpl/) (Second Edition). Cambridge University Press._

## External links

\[[edit](https://en.wikipedia.org/w/index.php?title=Abstract_syntax_tree&action=edit&section=13 "Edit section: External links")\]

Wikimedia Commons has media related to Abstract syntax trees.

-   [AST View](https://www.eclipse.org/jdt/ui/astview/index.php): an [Eclipse](https://en.wikipedia.org/wiki/Eclipse_\(software\) "Eclipse (software)") plugin to [visualize](https://en.wikipedia.org/wiki/Scientific_visualization "Scientific visualization") a [Java](https://en.wikipedia.org/wiki/Java_\(programming_language\) "Java (programming language)") abstract syntax tree
-   ["Abstract Syntax Tree and Java Code Manipulation in the Eclipse IDE"](https://www.eclipse.org/articles/Article-JavaCodeManipulation_AST/index.html). _eclipse.org_.
-   ["CAST representation"](http://www.cs.utah.edu/flux/flick/current/doc/guts/gutsch6.html). _cs.utah.edu_.
-   [eli project](https://eli-project.sourceforge.net/elionline/idem_3.html): Abstract Syntax Tree [Unparsing](https://en.wikipedia.org/wiki/Unparsing "Unparsing")
-   ["Architecture‑Driven Modernization — ADM: Abstract Syntax Tree Metamodeling — ASTM"](http://www.omg.org/spec/ASTM/). ([OMG](https://en.wikipedia.org/wiki/Object_Management_Group "Object Management Group") standard).
-   [JavaParser](https://javaparser.org/): The JavaParser library provides you with an Abstract Syntax Tree of your Java code. The AST structure then allows you to work with your Java code in an easy programmatic way.
-   [Spoon](https://github.com/INRIA/spoon): A library to analyze, transform, rewrite, and transpile Java source code. It parses source files to build a well-designed AST with powerful analysis and transformation API.
-   [AST Explorer](https://astexplorer.net/): A website to help visualize ASTs in several popular languages such as Go, Python, Java, and JavaScript.

| 
-   v
-   [t](https://en.wikipedia.org/wiki/Template_talk:Parsers "Template talk:Parsers")
-   e

[Parsing algorithms](https://en.wikipedia.org/wiki/Parsing "Parsing")

 |
| --- |
| [Top-down](https://en.wikipedia.org/wiki/Top-down_parsing "Top-down parsing") | 

-   [Earley](https://en.wikipedia.org/wiki/Earley_parser "Earley parser")
-   [LL](https://en.wikipedia.org/wiki/LL_parser "LL parser")
-   [Recursive descent](https://en.wikipedia.org/wiki/Recursive_descent_parser "Recursive descent parser")
    -   [Tail recursive](https://en.wikipedia.org/wiki/Tail_recursive_parser "Tail recursive parser")

 |
| [Bottom-up](https://en.wikipedia.org/wiki/Bottom-up_parsing "Bottom-up parsing") | 

-   Precedence
    -   [Simple](https://en.wikipedia.org/wiki/Simple_precedence_parser "Simple precedence parser")
    -   [Operator](https://en.wikipedia.org/wiki/Operator-precedence_parser "Operator-precedence parser")
        -   [Shunting-yard](https://en.wikipedia.org/wiki/Shunting_yard_algorithm "Shunting yard algorithm")
-   [LR](https://en.wikipedia.org/wiki/LR_parser "LR parser")
    -   [Simple](https://en.wikipedia.org/wiki/Simple_LR_parser "Simple LR parser")
    -   [Look-ahead](https://en.wikipedia.org/wiki/LALR_parser "LALR parser")
    -   [Canonical](https://en.wikipedia.org/wiki/Canonical_LR_parser "Canonical LR parser")
    -   [Generalized](https://en.wikipedia.org/wiki/GLR_parser "GLR parser")
-   [CYK](https://en.wikipedia.org/wiki/CYK_algorithm "CYK algorithm")
-   [Recursive ascent](https://en.wikipedia.org/wiki/Recursive_ascent_parser "Recursive ascent parser")
-   [Shift-reduce](https://en.wikipedia.org/wiki/Shift-reduce_parser "Shift-reduce parser")

 |
| Mixed, other | 

-   [Combinator](https://en.wikipedia.org/wiki/Parser_combinator "Parser combinator")
-   [Chart](https://en.wikipedia.org/wiki/Chart_parser "Chart parser")
    -   [Left corner](https://en.wikipedia.org/wiki/Left_corner_parser "Left corner parser")
-   Statistical

 |
| Related topics | 

-   [PEG](https://en.wikipedia.org/wiki/Parsing_expression_grammar "Parsing expression grammar")
-   [Definite clause grammar](https://en.wikipedia.org/wiki/Definite_clause_grammar "Definite clause grammar")
-   [Deterministic parsing](https://en.wikipedia.org/wiki/Deterministic_parsing "Deterministic parsing")
-   [Dynamic programming](https://en.wikipedia.org/wiki/Dynamic_programming "Dynamic programming")
-   [Memoization](https://en.wikipedia.org/wiki/Memoization "Memoization")
-   [Parser generator](https://en.wikipedia.org/wiki/Compiler-compiler "Compiler-compiler")
    -   [LALR](https://en.wikipedia.org/wiki/LALR_parser_generator "LALR parser generator")
-   [Parse tree](https://en.wikipedia.org/wiki/Parse_tree "Parse tree")
-   AST
-   [Scannerless parsing](https://en.wikipedia.org/wiki/Scannerless_parsing "Scannerless parsing")
-   [History of compiler construction](https://en.wikipedia.org/wiki/History_of_compiler_construction "History of compiler construction")
-   [Comparison of parser generators](https://en.wikipedia.org/wiki/Comparison_of_parser_generators "Comparison of parser generators")
-   [Operator-precedence grammar](https://en.wikipedia.org/wiki/Operator-precedence_grammar "Operator-precedence grammar")

 |

<table class="nowraplinks hlist navbox-inner" style="border-spacing:0;background:transparent;color:inherit"><tbody><tr><th id="Authority_control_databases_frameless&amp;#124;text-top&amp;#124;10px&amp;#124;alt=Edit_this_at_Wikidata&amp;#124;link=https&amp;#58;//www.wikidata.org/wiki/Q127380#identifiers&amp;#124;class=noprint&amp;#124;Edit_this_at_Wikidata376" scope="row" class="navbox-group" style="width:1%">Authority control databases <span class="mw-valign-text-top noprint" typeof="mw:File/Frameless"><a href="https://www.wikidata.org/wiki/Q127380#identifiers" title="Edit this at Wikidata"><img alt="Edit this at Wikidata" src="https://upload.wikimedia.org/wikipedia/en/thumb/8/8a/OOjs_UI_icon_edit-ltr-progressive.svg/20px-OOjs_UI_icon_edit-ltr-progressive.svg.png" decoding="async" width="10" height="10" class="mw-file-element" data-file-width="20" data-file-height="20"></a></span></th><td class="navbox-list-with-group navbox-list navbox-odd" style="width:100%;padding:0"><div style="padding:0 0.25em"><ul><li><span class="uid"><a rel="nofollow" class="external text" href="https://d-nb.info/gnd/4702177-9">GND</a></span></li></ul></div></td></tr></tbody></table>