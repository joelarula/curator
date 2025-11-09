"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataScalarFieldEnum = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
var FileDataScalarFieldEnum;
(function (FileDataScalarFieldEnum) {
    FileDataScalarFieldEnum["id"] = "id";
    FileDataScalarFieldEnum["name"] = "name";
    FileDataScalarFieldEnum["mimeType"] = "mimeType";
    FileDataScalarFieldEnum["source"] = "source";
    FileDataScalarFieldEnum["hash"] = "hash";
    FileDataScalarFieldEnum["size"] = "size";
    FileDataScalarFieldEnum["content"] = "content";
    FileDataScalarFieldEnum["projectId"] = "projectId";
    FileDataScalarFieldEnum["createdAt"] = "createdAt";
    FileDataScalarFieldEnum["updatedAt"] = "updatedAt";
})(FileDataScalarFieldEnum || (exports.FileDataScalarFieldEnum = FileDataScalarFieldEnum = {}));
TypeGraphQL.registerEnumType(FileDataScalarFieldEnum, {
    name: "FileDataScalarFieldEnum",
    description: undefined,
});
