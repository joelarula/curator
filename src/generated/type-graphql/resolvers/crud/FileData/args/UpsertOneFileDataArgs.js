"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpsertOneFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateInput_1 = require("../../../inputs/FileDataCreateInput");
const FileDataUpdateInput_1 = require("../../../inputs/FileDataUpdateInput");
const FileDataWhereUniqueInput_1 = require("../../../inputs/FileDataWhereUniqueInput");
let UpsertOneFileDataArgs = class UpsertOneFileDataArgs {
};
exports.UpsertOneFileDataArgs = UpsertOneFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], UpsertOneFileDataArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateInput_1.FileDataCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataCreateInput_1.FileDataCreateInput)
], UpsertOneFileDataArgs.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateInput_1.FileDataUpdateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateInput_1.FileDataUpdateInput)
], UpsertOneFileDataArgs.prototype, "update", void 0);
exports.UpsertOneFileDataArgs = UpsertOneFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpsertOneFileDataArgs);
