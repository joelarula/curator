"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentScalarFieldEnum = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
var DocumentScalarFieldEnum;
(function (DocumentScalarFieldEnum) {
    DocumentScalarFieldEnum["id"] = "id";
    DocumentScalarFieldEnum["content"] = "content";
    DocumentScalarFieldEnum["metadata"] = "metadata";
    DocumentScalarFieldEnum["createdAt"] = "createdAt";
    DocumentScalarFieldEnum["updatedAt"] = "updatedAt";
})(DocumentScalarFieldEnum || (exports.DocumentScalarFieldEnum = DocumentScalarFieldEnum = {}));
TypeGraphQL.registerEnumType(DocumentScalarFieldEnum, {
    name: "DocumentScalarFieldEnum",
    description: undefined,
});
