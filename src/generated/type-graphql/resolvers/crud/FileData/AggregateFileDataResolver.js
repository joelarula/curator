"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateFileDataArgs_1 = require("./args/AggregateFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const AggregateFileData_1 = require("../../outputs/AggregateFileData");
const helpers_1 = require("../../../helpers");
let AggregateFileDataResolver = class AggregateFileDataResolver {
    async aggregateFileData(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
};
exports.AggregateFileDataResolver = AggregateFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateFileData_1.AggregateFileData, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateFileDataArgs_1.AggregateFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], AggregateFileDataResolver.prototype, "aggregateFileData", null);
exports.AggregateFileDataResolver = AggregateFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], AggregateFileDataResolver);
