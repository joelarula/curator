"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataWhereInput_1 = require("../../../inputs/FileDataWhereInput");
let DeleteManyFileDataArgs = class DeleteManyFileDataArgs {
};
exports.DeleteManyFileDataArgs = DeleteManyFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], DeleteManyFileDataArgs.prototype, "where", void 0);
exports.DeleteManyFileDataArgs = DeleteManyFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteManyFileDataArgs);
